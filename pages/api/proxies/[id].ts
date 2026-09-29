import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { encryptSecret } from "@/lib/crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const id = req.query.id as string;
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "admin");
  if (!ctx) return;

  if (req.method === "GET") {
    const proxy = db.prepare(`
      SELECT id, workspace_id, name, host, port, protocol, username, 
             CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END as has_password, 
             status, last_checked_at, response_time_ms, created_at, updated_at
      FROM proxies WHERE id = ? AND workspace_id = ?
    `).get(id, ctx.workspaceId);
    if (!proxy) return res.status(404).json({ error: "Not found" });
    return res.json(proxy);
  }

  if (req.method === "PUT") {
    const { name, host, port, protocol, username, password, notes, location } = req.body;
    db.prepare(
      `UPDATE proxies SET
        name = COALESCE(?, name),
        host = COALESCE(?, host),
        port = COALESCE(?, port),
        protocol = COALESCE(?, protocol),
        username = ?,
        password = CASE WHEN ? = 1 THEN ? ELSE password END,
        notes = COALESCE(?, notes),
        location = COALESCE(?, location),
        updated_at = datetime('now')
       WHERE id = ? AND workspace_id = ?`
    ).run(name, host, port, protocol, username || null, password !== undefined ? 1 : 0, password ? encryptSecret(password) : null, notes !== undefined ? notes : null, location !== undefined ? location : null, id, ctx.workspaceId);
    recordAudit(ctx, "proxy.updated", "proxy", id);
    return res.json({ success: true });
  }

  if (req.method === "DELETE") {
    const proxy = db.prepare(`SELECT id FROM proxies WHERE id = ? AND workspace_id = ?`).get(id, ctx.workspaceId);
    if (!proxy) return res.status(404).json({ error: "Proxy not found" });

    db.prepare(`UPDATE accounts SET proxy_id = NULL WHERE proxy_id = ? AND workspace_id = ?`).run(id, ctx.workspaceId);
    db.prepare(`UPDATE accounts SET backup_proxy_id = NULL WHERE backup_proxy_id = ? AND workspace_id = ?`).run(id, ctx.workspaceId);
    db.prepare(`DELETE FROM proxies WHERE id = ? AND workspace_id = ?`).run(id, ctx.workspaceId);
    recordAudit(ctx, "proxy.deleted", "proxy", id);
    return res.status(204).end();
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  res.status(405).end();
}
