import { resolveMx } from "dns/promises";
import type DatabaseType from "better-sqlite3";
import { addSuppression } from "@/lib/platform/suppression";

type DB = DatabaseType.Database;

export type EmailVerifyStatus = "valid" | "invalid" | "catch_all" | "unknown";
export interface EmailVerifyResult { status: EmailVerifyStatus; reason: string }

const SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCEPT_ALL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
  "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com"
]);

export function emailStatusFor(status: EmailVerifyStatus): string {
  return status === "valid" ? "verified" : status === "invalid" ? "invalid" : status === "catch_all" ? "catchall" : "unverified";
}

// ------------------------------------------------------------------
// 1. Third-Party Provider Adapters
// ------------------------------------------------------------------

export interface EmailVerifierAdapter {
  name: string;
  verify(email: string, apiKey: string): Promise<EmailVerifyResult>;
}

const millionVerifierAdapter: EmailVerifierAdapter = {
  name: "millionverifier",
  async verify(email: string, apiKey: string): Promise<EmailVerifyResult> {
    const res = await fetch(`https://api.millionverifier.com/api/v3/?api=${apiKey}&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.resultcode === 1) return { status: "valid", reason: "MillionVerifier: Valid email" };
    if (data.resultcode === 2) return { status: "catch_all", reason: "MillionVerifier: Catch-all domain" };
    if (data.resultcode === 3) return { status: "invalid", reason: "MillionVerifier: Invalid address" };
    return { status: "unknown", reason: "MillionVerifier: Inconclusive result" };
  }
};

const zeroBounceAdapter: EmailVerifierAdapter = {
  name: "zerobounce",
  async verify(email: string, apiKey: string): Promise<EmailVerifyResult> {
    const res = await fetch(`https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.status === "valid") return { status: "valid", reason: "ZeroBounce: Valid email" };
    if (data.status === "catch-all") return { status: "catch_all", reason: "ZeroBounce: Catch-all domain" };
    if (["invalid", "spamtrap", "abuse", "do_not_mail"].includes(data.status)) {
      return { status: "invalid", reason: `ZeroBounce: ${data.status}` };
    }
    return { status: "unknown", reason: "ZeroBounce: Inconclusive result" };
  }
};

const debounceAdapter: EmailVerifierAdapter = {
  name: "debounce",
  async verify(email: string, apiKey: string): Promise<EmailVerifyResult> {
    const res = await fetch(`https://api.debounce.io/v1/?api=${apiKey}&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    const code = String(data.debounce?.code);
    if (code === "5") return { status: "valid", reason: "DeBounce: Valid email" };
    if (code === "2") return { status: "catch_all", reason: "DeBounce: Catch-all domain" };
    if (["6", "3", "7"].includes(code)) return { status: "invalid", reason: "DeBounce: Invalid address" };
    return { status: "unknown", reason: "DeBounce: Inconclusive result" };
  }
};

const PROVIDERS: Record<string, EmailVerifierAdapter> = {
  millionverifier: millionVerifierAdapter,
  zerobounce: zeroBounceAdapter,
  debounce: debounceAdapter,
};

// ------------------------------------------------------------------
// 2. Helper: Fetch Active Config (DB first, fallback to .env)
// ------------------------------------------------------------------

export function getWorkspaceVerifierConfig(db?: DB, workspaceId?: string) {
  if (db && workspaceId) {
    try {
      const row = db.prepare(
        `SELECT config FROM workspace_integrations WHERE workspace_id = ? AND provider = 'email_verifier'`
      ).get(workspaceId) as { config: string } | undefined;

      if (row?.config) {
        const parsed = JSON.parse(row.config);
        if (parsed.api_key) {
          return { provider: parsed.provider || "millionverifier", apiKey: parsed.api_key };
        }
      }
    } catch {
      /* ignore JSON error */
    }
  }

  return {
    provider: process.env.VERIFIER_PROVIDER || "millionverifier",
    apiKey: process.env.VERIFIER_API_KEY || "",
  };
}

async function verifyWithThirdPartyApi(email: string, config: { provider: string; apiKey: string }, timeoutMs?: number): Promise<EmailVerifyResult> {
  if (!config.apiKey) return { status: "unknown", reason: "API key not configured" };

  const adapter = PROVIDERS[config.provider.toLowerCase()];
  if (!adapter) return { status: "unknown", reason: `Unsupported verifier provider: ${config.provider}` };

  try {
    if (timeoutMs && timeoutMs > 0) {
      return await Promise.race([
        adapter.verify(email, config.apiKey),
        new Promise<EmailVerifyResult>((resolve) =>
          setTimeout(() => resolve({ status: "unknown", reason: "Verification request timed out" }), timeoutMs)
        ),
      ]);
    }
    return await adapter.verify(email, config.apiKey);
  } catch (error) {
    console.error(`Verification error [${config.provider}]:`, error);
    return { status: "unknown", reason: `${config.provider} API request failed` };
  }
}

// ------------------------------------------------------------------
// 3. Core Verification Function
// ------------------------------------------------------------------

export async function verifyEmailAddress(
  email: string,
  opts: { db?: DB; workspaceId?: string; fromEmail?: string; timeoutMs?: number } = {}
): Promise<EmailVerifyResult> {
  const addr = email.trim().toLowerCase();

  // 1. FREE: Syntax Check
  if (!SYNTAX.test(addr)) return { status: "invalid", reason: "Invalid email format" };
  const domain = addr.split("@")[1];

  // 2. FREE: MX Record Check
  let mx: { exchange: string; priority: number }[];
  try {
    mx = await resolveMx(domain);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return { status: "invalid", reason: "Domain cannot receive email (no MX record)" };
    return { status: "unknown", reason: "Could not resolve domain (temporary DNS error)" };
  }
  if (!mx.length) return { status: "invalid", reason: "Domain has no mail server (no MX record)" };

  // 3. FREE: Major Consumer Domain Filter
  if (ACCEPT_ALL_DOMAINS.has(domain)) return { status: "catch_all", reason: "Major provider — accepts all at connect time" };

  // 4. Third-Party API Check
  const config = getWorkspaceVerifierConfig(opts.db, opts.workspaceId);
  return await verifyWithThirdPartyApi(addr, config, opts.timeoutMs);
}

// ------------------------------------------------------------------
// 4. Queue Processing & Suppression Runners
// ------------------------------------------------------------------

function senderResolver(db: DB) {
  const cache = new Map<string, string | undefined>();
  const stmt = db.prepare("SELECT from_email FROM email_accounts WHERE workspace_id = ? AND is_verified = 1 AND from_email IS NOT NULL ORDER BY created_at LIMIT 1");
  return (workspaceId: string): string | undefined => {
    if (!cache.has(workspaceId)) cache.set(workspaceId, (stmt.get(workspaceId) as { from_email: string } | undefined)?.from_email);
    return cache.get(workspaceId);
  };
}

export function pendingVerificationCount(db: DB, workspaceId: string): number {
  return (db.prepare("SELECT COUNT(*) c FROM targets WHERE workspace_id = ? AND email_verify_requested_at IS NOT NULL").get(workspaceId) as { c: number }).c;
}

export async function processVerificationQueue(db: DB, opts: { limit?: number } = {}): Promise<number> {
  const limit = opts.limit ?? 20;
  const rows = db.prepare(
    `SELECT id, email, workspace_id FROM targets
     WHERE email_verify_requested_at IS NOT NULL AND email IS NOT NULL
     ORDER BY email_verify_requested_at LIMIT ?`
  ).all(limit) as { id: string; email: string; workspace_id: string }[];
  if (!rows.length) return 0;

  const update = db.prepare("UPDATE targets SET email_status = ?, email_verified_at = datetime('now'), email_verify_requested_at = NULL WHERE id = ?");

  await Promise.all(rows.map(async (row) => {
    const verdict = await verifyEmailAddress(row.email, { db, workspaceId: row.workspace_id });
    update.run(emailStatusFor(verdict.status), row.id);
    if (verdict.status === "invalid") {
      addSuppression({ workspaceId: row.workspace_id, kind: "email", value: row.email, reason: `Email verification: ${verdict.reason}`, source: "verification", targetId: row.id });
    }
  }));
  return rows.length;
}

export interface VerifyBatchResult {
  checked: number; valid: number; invalid: number; catch_all: number; unknown: number; suppressed: number;
}

export async function verifyAndSuppressTargets(
  db: DB,
  workspaceId: string,
  targetIds: string[],
  opts: { createdBy?: string } = {},
): Promise<VerifyBatchResult> {
  const result: VerifyBatchResult = { checked: 0, valid: 0, invalid: 0, catch_all: 0, unknown: 0, suppressed: 0 };
  const select = db.prepare("SELECT id, email FROM targets WHERE id = ? AND workspace_id = ?");
  const update = db.prepare("UPDATE targets SET email_status = ? WHERE id = ?");

  for (const id of targetIds) {
    const row = select.get(id, workspaceId) as { id: string; email: string | null } | undefined;
    if (!row?.email) continue;
    const verdict = await verifyEmailAddress(row.email, { db, workspaceId });
    result.checked++;
    result[verdict.status]++;
    update.run(emailStatusFor(verdict.status), id);
    if (verdict.status === "invalid") {
      addSuppression({ workspaceId, kind: "email", value: row.email, reason: `Email verification: ${verdict.reason}`, source: "verification", targetId: id, createdBy: opts.createdBy });
      result.suppressed++;
    }
  }
  return result;
}