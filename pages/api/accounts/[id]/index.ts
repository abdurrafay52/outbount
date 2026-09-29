import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { requireWorkspace, recordAudit } from "@/lib/workspace";

const ACCOUNT_COLUMNS = `a.id, a.name, a.email, a.is_authenticated, a.daily_connection_limit, a.daily_message_limit, a.daily_inmail_limit,
  a.active_hours_start, a.active_hours_end, a.timezone, a.working_days, a.created_at,
  a.inbox_synced_at, a.accepted_sync_at, a.li_connections, a.li_pending, a.li_profile_views,
  a.li_stats_synced_at, a.connections_synced_through_ms, a.proxy_id, a.backup_proxy_id, a.notes`;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const id = req.query.id as string;
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "admin");
  if (!ctx) return;

  if (req.method === "GET") {
    const account = db.prepare(`
      SELECT ${ACCOUNT_COLUMNS}, p.status as proxy_status
      FROM accounts a
      LEFT JOIN proxies p ON a.proxy_id = p.id
      WHERE a.id = ? AND a.workspace_id = ? AND (a.deleted_at IS NULL OR a.deleted_at = '')
    `).get(id, ctx.workspaceId);
    if (!account) return res.status(404).json({ error: "Not found" });
    return res.json(account);
  }

  if (req.method === "PUT") {
    const { name, email, daily_connection_limit, daily_message_limit, daily_inmail_limit, active_hours_start, active_hours_end, timezone, working_days, proxy_id, backup_proxy_id, notes } = req.body;
    db.prepare(
      `UPDATE accounts SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        daily_connection_limit = COALESCE(?, daily_connection_limit),
        daily_message_limit = COALESCE(?, daily_message_limit),
        daily_inmail_limit = COALESCE(?, daily_inmail_limit),
        active_hours_start = COALESCE(?, active_hours_start),
        active_hours_end = COALESCE(?, active_hours_end),
        timezone = COALESCE(?, timezone),
        working_days = COALESCE(?, working_days),
        proxy_id = CASE WHEN ? = 1 THEN ? ELSE proxy_id END,
        backup_proxy_id = CASE WHEN ? = 1 THEN ? ELSE backup_proxy_id END,
        notes = COALESCE(?, notes)
       WHERE id = ? AND workspace_id = ? AND (deleted_at IS NULL OR deleted_at = '')`
    ).run(name, email, daily_connection_limit, daily_message_limit, daily_inmail_limit, active_hours_start, active_hours_end, timezone, working_days, proxy_id !== undefined ? 1 : 0, proxy_id || null, backup_proxy_id !== undefined ? 1 : 0, backup_proxy_id || null, notes !== undefined ? notes : null, id, ctx.workspaceId);
    recordAudit(ctx, "account.updated", "account", id);
    return res.json(db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts a WHERE a.id = ? AND a.workspace_id = ?`).get(id, ctx.workspaceId));
  }

  if (req.method === "DELETE") {
    // 1. Fetch target account
    const account = db.prepare(`SELECT id, email, deleted_at FROM accounts WHERE id = ? AND workspace_id = ?`).get(id, ctx.workspaceId) as { id: string; email: string; deleted_at: string | null } | undefined;

    if (!account) return res.status(404).json({ error: "Account not found" });
    if (account.deleted_at && account.deleted_at !== "") return res.status(400).json({ error: "Account is already deleted" });

    // 2. Force concatenation in JS so SQLite can't fail silently
    const safeNewEmail = `${account.email}__deleted_${Date.now()}`;

    // 3. Perform Soft Delete
    db.prepare(`
      UPDATE accounts 
      SET deleted_at = CURRENT_TIMESTAMP, email = ?
      WHERE id = ? AND workspace_id = ?
    `).run(safeNewEmail, id, ctx.workspaceId);

    recordAudit(ctx, "account.soft_deleted", "account", id);
    return res.status(204).end();
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  res.status(405).end();
}