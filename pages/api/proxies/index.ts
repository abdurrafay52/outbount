import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { encryptSecret } from "@/lib/crypto";
import { parseProxyString } from "@/lib/proxy/checker";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "member");
  if (!ctx) return;

  if (req.method === "GET") {
    // 🚫 Prevent Next.js & browser from caching
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const proxies = db.prepare(`
      SELECT p.id, p.workspace_id, p.name, p.host, p.port, p.protocol, p.username, 
             CASE WHEN p.password IS NOT NULL THEN 1 ELSE 0 END as has_password, 
             p.status, p.last_checked_at, p.response_time_ms, p.location, p.notes, p.created_at, p.updated_at,
             COUNT(a.id) as assigned_account_count
      FROM proxies p
      LEFT JOIN accounts a ON (a.proxy_id = p.id OR a.backup_proxy_id = p.id) AND (a.deleted_at IS NULL OR a.deleted_at = '')
      WHERE p.workspace_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all(ctx.workspaceId);

    return res.json(proxies);
  }

  if (req.method === "POST") {
    const { name, host, port, protocol, username, password, notes, raw_text } = req.body;
    
    // Bulk import
    if (raw_text) {
      const parsed = parseProxyString(raw_text);
      if (parsed.length === 0) return res.status(400).json({ error: "No valid proxies found in text" });
      
      const insert = db.prepare(`
        INSERT INTO proxies (id, workspace_id, name, host, port, protocol, username, password, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const createdIds: string[] = [];
      db.transaction(() => {
        for (const p of parsed) {
          const id = randomUUID();
          insert.run(id, ctx.workspaceId, name || `${p.host}:${p.port}`, p.host, p.port, p.protocol, p.username || null, p.password ? encryptSecret(p.password) : null, notes || null);
          createdIds.push(id);
        }
      })();
      
      recordAudit(ctx, "proxies.bulk_created", "proxy", undefined, { count: createdIds.length });
      return res.status(201).json({ success: true, count: createdIds.length });
    }
    
    // Single import
    if (!host || !port) return res.status(400).json({ error: "Host and port required" });
    
    const id = randomUUID();
    db.prepare(`
      INSERT INTO proxies (id, workspace_id, name, host, port, protocol, username, password, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ctx.workspaceId, name || `${host}:${port}`, host, port, protocol || "HTTP", username || null, password ? encryptSecret(password) : null, notes || null);
    
    recordAudit(ctx, "proxy.created", "proxy", id);
    return res.status(201).json({ id });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
