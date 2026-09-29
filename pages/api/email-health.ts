import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { evaluateSenderHealth } from "@/lib/email/infrastructure";

type AccountRow = {
  id: string;
  name: string;
  from_email: string;
  daily_email_limit: number;
  ramp_up_enabled: number;
  ramp_start_date: string | null;
  imap_host: string | null;
  // Warmup settings columns
  warmup_enabled: number | null;
  warmup_max_target: number | null;
  warmup_ramp_increment: number | null;
  warmup_start_volume: number | null;
  warmup_reply_rate: number | null;
  warmup_started_at: string | null;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const ctx = requireWorkspace(req, res);
  if (!ctx) return;
  const db = getDb();

  // 1. Fetch Accounts joined with Warmup Settings
  const accounts = db.prepare(`
    SELECT 
      ea.id, ea.name, ea.from_email, ea.daily_email_limit, ea.ramp_up_enabled, ea.ramp_start_date, ea.imap_host,
      ws.enabled as warmup_enabled,
      ws.max_daily_target as warmup_max_target,
      ws.ramp_increment as warmup_ramp_increment,
      ws.start_volume as warmup_start_volume,
      ws.reply_rate as warmup_reply_rate,
      ws.started_at as warmup_started_at
    FROM email_accounts ea
    LEFT JOIN warmup_settings ws ON ws.email_account_id = ea.id
    WHERE ea.workspace_id = ?
    ORDER BY ea.name
  `).all(ctx.workspaceId) as AccountRow[];

  // 2. Outreach Campaign Sends (Last 7 Days)
  const dailySends = db.prepare(`
    SELECT rp.email_account_id,
           date(l.created_at) as day,
           COUNT(*) as sent
    FROM logs l
    JOIN run_profiles rp ON rp.run_id = l.run_id AND rp.target_id = l.target_id
    JOIN runs r ON r.id = l.run_id
    WHERE l.message LIKE 'Email sent%'
      AND r.workspace_id = ?
      AND l.created_at >= date('now', '-6 days')
    GROUP BY rp.email_account_id, date(l.created_at)
  `).all(ctx.workspaceId) as { email_account_id: string; day: string; sent: number }[];

  // 3. Warmup Stats Today (Sent & Rescued)
  const warmupTodayStats = db.prepare(`
    SELECT 
      from_account_id,
      COUNT(*) as sent_today,
      SUM(CASE WHEN rescued_at IS NOT NULL THEN 1 ELSE 0 END) as rescued_today
    FROM warmup_messages
    WHERE workspace_id = ? AND date(sent_at) = date('now')
    GROUP BY from_account_id
  `).all(ctx.workspaceId) as { from_account_id: string; sent_today: number; rescued_today: number }[];

  const warmupStatsIndex: Record<string, { sent: number; rescued: number }> = {};
  for (const row of warmupTodayStats) {
    warmupStatsIndex[row.from_account_id] = {
      sent: row.sent_today,
      rescued: row.rescued_today,
    };
  }

  // 4. Outreach Send Logs & Guard Trips
  const recentLogs = db.prepare(`
    SELECT l.created_at, l.message, rp.email_account_id
    FROM logs l
    JOIN run_profiles rp ON rp.run_id = l.run_id AND rp.target_id = l.target_id
    JOIN runs r ON r.id = l.run_id
    WHERE l.message LIKE 'Email sent%'
      AND r.workspace_id = ?
    ORDER BY l.created_at DESC
    LIMIT 50
  `).all(ctx.workspaceId) as { created_at: string; message: string; email_account_id: string }[];

  const guardTrips = db.prepare(`
    SELECT l.created_at, l.message, rp.email_account_id
    FROM logs l
    LEFT JOIN run_profiles rp ON rp.run_id = l.run_id AND rp.target_id = l.target_id
    JOIN runs r ON r.id = l.run_id
    WHERE r.workspace_id = ? AND (l.message LIKE '%Daily limit%' OR l.message LIKE '%limit guard%')
      AND date(l.created_at) = date('now')
    ORDER BY l.created_at DESC
    LIMIT 50
  `).all(ctx.workspaceId) as { created_at: string; message: string; email_account_id: string | null }[];

  // Helper: Calculate Outreach Campaign Effective Limit
  function effectiveLimit(a: AccountRow, date: Date) {
    if (!a.ramp_up_enabled || !a.ramp_start_date) return a.daily_email_limit;
    const start = new Date(a.ramp_start_date);
    const daysActive = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(a.daily_email_limit, daysActive * 2);
  }

  // Helper: Calculate Today's Warmup Dynamic Target
  function calculateWarmupTodayTarget(a: AccountRow): number {
    if (!a.warmup_started_at) return a.warmup_start_volume ?? 2;
    const start = new Date(a.warmup_started_at).getTime();
    const daysActive = Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24)));
    const target = (a.warmup_start_volume ?? 2) + daysActive * (a.warmup_ramp_increment ?? 2);
    return Math.min(target, a.warmup_max_target ?? 30);
  }

  const now = new Date();
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const sendsIndex: Record<string, Record<string, number>> = {};
  for (const row of dailySends) {
    if (!sendsIndex[row.email_account_id]) sendsIndex[row.email_account_id] = {};
    sendsIndex[row.email_account_id][row.day] = row.sent;
  }

  const today = now.toISOString().slice(0, 10);

  const result = accounts.map((a) => {
    const sentToday = sendsIndex[a.id]?.[today] ?? 0;
    const limit = effectiveLimit(a, now);
    const h = evaluateSenderHealth(a.id);

    const wStats = warmupStatsIndex[a.id] ?? { sent: 0, rescued: 0 };
    const warmupTodayTarget = calculateWarmupTodayTarget(a);

    return {
      id: a.id,
      name: a.name,
      from_email: a.from_email,
      daily_email_limit: a.daily_email_limit,
      ramp_up_enabled: a.ramp_up_enabled,
      ramp_start_date: a.ramp_start_date,
      effective_limit_today: limit,
      sent_today: sentToday,
      can_receive_replies: !!a.imap_host,

      // 💥 NEW: Clear Warmup Network Data
      warmup: {
        enabled: a.warmup_enabled === 1,
        max_target: a.warmup_max_target ?? 30,
        today_target: warmupTodayTarget,
        sent_today: wStats.sent,
        rescued_today: wStats.rescued,
        reply_rate: a.warmup_reply_rate ?? 45,
      },

      health: h
        ? {
          sent_30d: h.sent,
          bounces: h.bounces,
          complaints: h.complaints,
          bounce_rate: h.bounce_rate,
          complaint_rate: h.complaint_rate,
          paused: h.paused,
          reason: h.reason ?? null,
        }
        : null,
      days: days.map((day) => ({
        day,
        sent: sendsIndex[a.id]?.[day] ?? 0,
        limit: effectiveLimit(a, new Date(day + "T12:00:00Z")),
      })),
    };
  });

  res.json({ accounts: result, days, recentLogs, guardTrips });
}