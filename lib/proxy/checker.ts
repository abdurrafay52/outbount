import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export interface ProxyRecord {
  id: string;
  workspace_id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string | null;
  password: string | null;
  status: "UNTESTED" | "ACTIVE" | "INACTIVE" | "ERROR";
  last_checked_at: string | null;
  response_time_ms: number | null;
  location?: string | null;
  notes?: string | null;
}

function getFlagEmoji(countryCode?: string) {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export async function pingProxyConfig(proxy: { host: string; port: number; protocol: string; username?: string; password?: string }) {
  const startTime = Date.now();
  
  return new Promise<{ status: "ACTIVE" | "ERROR", responseTimeMs: number | null, location?: string }>((resolve) => {
    try {
      const isSocks = proxy.protocol.toLowerCase().startsWith('socks');
      let proxyUrl = "";
      if (proxy.username && proxy.password) {
        proxyUrl = `${proxy.protocol.toLowerCase()}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
      } else {
        proxyUrl = `${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`;
      }

      const agent = isSocks ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);
      
      const req = http.get("http://ip-api.com/json", { agent, timeout: 5000 }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (data.status === 'success' || data.query) {
              const flag = getFlagEmoji(data.countryCode);
              const loc = [flag, data.country, data.city ? `(${data.city})` : ''].filter(Boolean).join(" ");
              resolve({ status: "ACTIVE", responseTimeMs: Date.now() - startTime, location: loc || data.country });
              return;
            }
          } catch {}
          resolve({ status: "ACTIVE", responseTimeMs: Date.now() - startTime });
        });
      });
      
      req.on('error', () => {
        const req2 = https.get("https://api.ipify.org?format=json", { agent, timeout: 4000 }, (res2) => {
          let raw2 = '';
          res2.on('data', chunk => raw2 += chunk);
          res2.on('end', () => {
            if (res2.statusCode === 200 && raw2.includes('ip')) {
              resolve({ status: "ACTIVE", responseTimeMs: Date.now() - startTime });
            } else {
              resolve({ status: "ERROR", responseTimeMs: null });
            }
          });
        });
        req2.on('error', () => resolve({ status: "ERROR", responseTimeMs: null }));
        req2.on('timeout', () => { req2.destroy(); resolve({ status: "ERROR", responseTimeMs: null }); });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: "ERROR", responseTimeMs: null });
      });
    } catch (err: any) {
      resolve({ status: "ERROR", responseTimeMs: null });
    }
  });
}

export async function checkProxyHealth(proxyId: string, workspaceId: string): Promise<ProxyRecord> {
  const db = getDb();
  
  // 1. Fetch proxy
  const proxy = db.prepare(`SELECT * FROM proxies WHERE id = ? AND workspace_id = ?`).get(proxyId, workspaceId) as ProxyRecord | undefined;
  if (!proxy) {
    throw new Error("Proxy not found");
  }

  const username = proxy.username || undefined;
  const password = proxy.password ? decryptSecret(proxy.password) || undefined : undefined;

  const { status, responseTimeMs, location } = await pingProxyConfig({
    host: proxy.host,
    port: proxy.port,
    protocol: proxy.protocol,
    username,
    password
  });

  // 3. Update DB
  db.prepare(`
    UPDATE proxies 
    SET status = ?, last_checked_at = datetime('now'), response_time_ms = ?, location = COALESCE(?, location) 
    WHERE id = ? AND workspace_id = ?
  `).run(status, responseTimeMs, location || null, proxyId, workspaceId);

  return db.prepare(`SELECT * FROM proxies WHERE id = ? AND workspace_id = ?`).get(proxyId, workspaceId) as ProxyRecord;
}

export async function checkAllProxies(workspaceId: string): Promise<void> {
  const db = getDb();
  const proxies = db.prepare(`SELECT id FROM proxies WHERE workspace_id = ?`).all(workspaceId) as { id: string }[];
  
  // Basic concurrency limit (batch of 5)
  const CONCURRENCY = 5;
  for (let i = 0; i < proxies.length; i += CONCURRENCY) {
    const batch = proxies.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(p => checkProxyHealth(p.id, workspaceId)));
  }
}

export interface ParsedProxy {
  host: string;
  port: number;
  protocol: string; // HTTP, HTTPS, SOCKS5
  username?: string;
  password?: string;
}

export function parseProxyString(input: string): ParsedProxy[] {
  const results: ParsedProxy[] = [];
  const lines = input.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    let protocol = "HTTP";
    let workingLine = line;

    // e.g. socks5://user:pass@host:port or http://host:port
    const protocolMatch = workingLine.match(/^(http|https|socks5|socks4):\/\//i);
    if (protocolMatch) {
      protocol = protocolMatch[1].toUpperCase();
      if (protocol === "SOCKS4") protocol = "SOCKS5"; // treat socks4 as socks5 for simplicity
      workingLine = workingLine.slice(protocolMatch[0].length);
    }

    // Try URL-style: user:pass@host:port
    const atIndex = workingLine.lastIndexOf("@");
    if (atIndex > -1) {
      const credentials = workingLine.substring(0, atIndex);
      const server = workingLine.substring(atIndex + 1);
      
      const [username, ...passParts] = credentials.split(":");
      const password = passParts.join(":");
      
      const [host, portStr] = server.split(":");
      if (host && portStr && !isNaN(Number(portStr))) {
        results.push({ protocol, host, port: Number(portStr), username, password });
        continue;
      }
    }

    // Try traditional format: host:port:user:pass
    const parts = workingLine.split(":");
    if (parts.length >= 2) {
      const host = parts[0];
      const port = Number(parts[1]);
      if (!isNaN(port)) {
        const username = parts[2] || undefined;
        const password = parts.slice(3).join(":") || undefined;
        results.push({ protocol, host, port, username, password });
      }
    }
  }

  return results;
}
