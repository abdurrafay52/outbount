import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { requireWorkspace, recordAudit } from "@/lib/workspace";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "admin");
  if (!ctx) return;

  if (req.method === "GET") {
    const rows = db.prepare("SELECT key, api_key, updated_at FROM integrations WHERE workspace_id = ?").all(ctx.workspaceId) as {
      key: string;
      api_key: string | null;
      updated_at: string;
    }[];

    const masked = rows.map((r) => {
      const plain = decryptSecret(r.api_key);
      // Extract base provider name (e.g., "millionverifier" from "millionverifier_1723049200")
      const baseKey = r.key.split("_")[0];

      return {
        id: r.key,                          // Full unique key name (used for deleting specific keys)
        key: baseKey,                       // Base key name (used by UI to group/match integration items)
        updated_at: r.updated_at,
        api_key_masked: plain ? "••••••••" + plain.slice(-4) : null,
        configured: !!plain,
      };
    });

    return res.json(masked);
  }

  if (req.method === "POST") {
    const { key, api_key } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    if (!api_key) return res.status(400).json({ error: "api_key required" });

    const providerKey = String(key).toLowerCase();
    const isVerifier = ["millionverifier", "zerobounce", "debounce"].includes(providerKey);

    if (isVerifier) {
      const isValid = await validateVerifierKey(providerKey, api_key);
      if (!isValid) {
        return res.status(400).json({
          error: `Invalid API key for ${key}. Please check your credentials.`
        });
      }
    }

    // Append a timestamp to make every saved key unique (e.g., "apollo_1723049200")
    // This allows saving multiple keys for the exact same provider!
    const uniqueKey = `${key}_${Date.now()}`;

    db.prepare(`
      INSERT INTO integrations (workspace_id, key, api_key, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(ctx.workspaceId, uniqueKey, encryptSecret(api_key));

    recordAudit(ctx, "integration.configured", "integration", String(uniqueKey));
    return res.json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: "key required" });

    // Deletes the exact unique key (e.g., "apollo_1723000000")
    // OR matches all keys for that provider if base name is passed (e.g., "apollo_%")
    db.prepare(`
      DELETE FROM integrations 
      WHERE (key = ? OR key LIKE ?) AND workspace_id = ?
    `).run(key, `${key}_%`, ctx.workspaceId);

    recordAudit(ctx, "integration.deleted", "integration", String(key));
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  res.status(405).end();
}
// Helper to test if email verifier API key is actually real
async function validateVerifierKey(provider: string, apiKey: string): Promise<boolean> {
  try {
    const key = apiKey.trim();
    if (!key) return false;

    if (provider === "millionverifier") {
      const res = await fetch(`https://api.millionverifier.com/api/v3/credits?api_key=${key}`);
      const data = await res.json();
      return res.ok && data.credits !== undefined && data.credits !== -1;
    }

    if (provider === "zerobounce") {
      const res = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${key}`);
      const data = await res.json();
      return res.ok && data.credits !== undefined && data.credits !== "-1";
    }

    if (provider === "debounce") {
      const res = await fetch(`https://api.debounce.io/v1/?api=${key}&search=test@example.com`);
      const data = await res.json();
      return res.ok && String(data.success) === "1";
    }

    return true; // Pass through non-verifier integrations (Apollo, OpenRouter, etc.)
  } catch {
    return false;
  }
}