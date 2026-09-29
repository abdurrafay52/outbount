import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { requireWorkspace, recordAudit } from "@/lib/workspace";

const ACCOUNT_COLUMNS = `id, name, email, is_authenticated, daily_connection_limit, daily_message_limit, daily_inmail_limit,
  active_hours_start, active_hours_end, timezone, working_days, created_at,
  inbox_synced_at, accepted_sync_at, li_connections, li_pending, li_profile_views,
  li_stats_synced_at, connections_synced_through_ms, proxy_id, backup_proxy_id, backup_proxy_status, notes`;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "member");
  if (!ctx) return;

  // GET: Fetch only active (non-deleted) accounts
  if (req.method === "GET") {
    // 🚫 Prevent Next.js & browser from caching stale account lists on refresh
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const accounts = db.prepare(`
      SELECT a.id, a.name, a.email, a.is_authenticated, a.daily_connection_limit, a.daily_message_limit, a.daily_inmail_limit,
             a.active_hours_start, a.active_hours_end, a.timezone, a.working_days, a.created_at,
             a.inbox_synced_at, a.accepted_sync_at, a.li_connections, a.li_pending, a.li_profile_views,
             a.li_stats_synced_at, a.connections_synced_through_ms, a.proxy_id, a.backup_proxy_id, a.backup_proxy_status, a.notes,
             p.status as proxy_status
      FROM accounts a
      LEFT JOIN proxies p ON a.proxy_id = p.id
      WHERE a.workspace_id = ? AND (a.deleted_at IS NULL OR a.deleted_at = '')
      ORDER BY a.created_at DESC
    `).all(ctx.workspaceId);

    return res.json(accounts);
  }
}