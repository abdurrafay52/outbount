import { resolveMx } from "dns/promises";
import { getDb } from "@/lib/db";

const mxCache = new Map<string, string>();

export async function getDomainProvider(domain: string): Promise<string> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  try {
    const mxRecords = await resolveMx(domain);
    const hasGoogle = mxRecords.some(mx => mx.exchange.toLowerCase().includes("aspmx.l.google.com"));
    const hasMicrosoft = mxRecords.some(mx => mx.exchange.toLowerCase().includes("outlook.com") || mx.exchange.toLowerCase().includes("protection.outlook.com"));
    
    let provider = "unknown";
    if (hasGoogle) provider = "gmail";
    else if (hasMicrosoft) provider = "microsoft";
    
    mxCache.set(domain, provider);
    return provider;
  } catch {
    mxCache.set(domain, "unknown");
    return "unknown";
  }
}

export async function assignEmailAccounts(
  targetIds: string[],
  emailAccountPool: string[]
): Promise<Map<string, string | null>> {
  const db = getDb();
  const emailAssignment = new Map<string, string | null>();
  if (emailAccountPool.length === 0 || targetIds.length === 0) {
    for (const tid of targetIds) emailAssignment.set(tid, null);
    return emailAssignment;
  }

  const placeholders = targetIds.map(() => "?").join(",");
  const companyRows = db.prepare(
    `SELECT id, company_id, email FROM targets WHERE id IN (${placeholders})`
  ).all(...targetIds) as { id: string; company_id: string | null; email: string | null }[];

  const poolPlaceholders = emailAccountPool.map(() => "?").join(",");
  const poolAccounts = db.prepare(
    `SELECT id, provider FROM email_accounts WHERE id IN (${poolPlaceholders})`
  ).all(...emailAccountPool) as { id: string; provider: string }[];
  
  const providerPools = {
    gmail: poolAccounts.filter(a => a.provider === "gmail").map(a => a.id),
    microsoft: poolAccounts.filter(a => a.provider === "microsoft").map(a => a.id),
  };

  const getFallbackAccount = (cursor: number) => emailAccountPool[cursor % emailAccountPool.length];

  const companyAccountMap = new Map<string, string>();
  let poolCursor = 0;

  for (const row of companyRows) {
    let domainProvider = "unknown";
    if (row.email) {
      const domain = row.email.split("@")[1];
      if (domain) domainProvider = await getDomainProvider(domain);
    }

    const pickAccount = (provider: string, defaultCursor: number) => {
      if (provider === "gmail" && providerPools.gmail.length > 0) return providerPools.gmail[defaultCursor % providerPools.gmail.length];
      if (provider === "microsoft" && providerPools.microsoft.length > 0) return providerPools.microsoft[defaultCursor % providerPools.microsoft.length];
      return getFallbackAccount(defaultCursor);
    };

    if (row.company_id) {
      if (!companyAccountMap.has(row.company_id)) {
        companyAccountMap.set(row.company_id, pickAccount(domainProvider, poolCursor));
        poolCursor++;
      }
      emailAssignment.set(row.id, companyAccountMap.get(row.company_id)!);
    } else {
      emailAssignment.set(row.id, pickAccount(domainProvider, poolCursor));
      poolCursor++;
    }
  }

  return emailAssignment;
}
