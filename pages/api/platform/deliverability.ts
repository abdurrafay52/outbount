import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { checkDomainDeliverability } from "@/lib/platform/deliverability";
import { sendEmailDurably } from "@/lib/email/infrastructure";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { encryptSecret } from "@/lib/crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "admin");
  if (!ctx) return;
  const db = getDb();
  if (req.method === "GET") {
    return res.json({
      latest_checks: db.prepare(`SELECT dc.*, ea.name account_name, ea.from_email FROM deliverability_checks dc
        LEFT JOIN email_accounts ea ON ea.id = dc.email_account_id WHERE dc.workspace_id = ?
        AND dc.checked_at = (SELECT MAX(dc2.checked_at) FROM deliverability_checks dc2 WHERE dc2.workspace_id = dc.workspace_id AND dc2.domain = dc.domain)
        ORDER BY dc.checked_at DESC`).all(ctx.workspaceId),
      warmup: db.prepare(`SELECT ws.*, ea.name, ea.from_email,
        (SELECT COUNT(*) FROM warmup_messages wm WHERE wm.from_account_id = ea.id AND wm.status = 'scheduled') scheduled_backlog,
        (SELECT COUNT(*) FROM warmup_messages wm WHERE wm.from_account_id = ea.id AND date(wm.sent_at) = date('now') AND wm.status = 'sent') sent_today,
        (SELECT COUNT(*) FROM warmup_messages wm WHERE wm.from_account_id = ea.id AND wm.engaged_at IS NOT NULL) delivered_total,
        (SELECT COUNT(*) FROM warmup_messages wm WHERE wm.from_account_id = ea.id AND wm.rescued_at IS NOT NULL) rescued_total,
        (SELECT COUNT(*) FROM warmup_messages wm WHERE wm.from_account_id = ea.id AND wm.rescued_at IS NOT NULL AND date(wm.rescued_at) = date('now')) rescued_today
        FROM warmup_settings ws JOIN email_accounts ea ON ea.id = ws.email_account_id WHERE ws.workspace_id = ?`).all(ctx.workspaceId),
      placement_tests: db.prepare("SELECT * FROM inbox_placement_tests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100").all(ctx.workspaceId),
      pools: db.prepare("SELECT * FROM warmup_pools WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY name ASC").all(ctx.workspaceId),
    });
  }
  if (req.method !== "POST") return res.status(405).end();
  const { action } = req.body as { action?: string };
  if (action === "check_domain") {
    const { domain, email_account_id, selector } = req.body;
    if (!domain) return res.status(400).json({ error: "domain is required" });
    if (email_account_id && !db.prepare("SELECT 1 FROM email_accounts WHERE id=? AND workspace_id=?").get(email_account_id, ctx.workspaceId)) return res.status(400).json({ error: "Email account not found" });
    const result = await checkDomainDeliverability(domain);
    recordAudit(ctx, "deliverability.checked", "domain", domain, { score: result.score });
    return res.json(result);
  }
  if (action === "configure_warmup") {
    const {
      email_account_id,
      enabled = true,
      daily_target,
      max_daily_target,
      ramp_increment,
      start_volume,
      reply_rate,
      ai_content_enabled,
      pool_id = null,
      timezone = "UTC",
      active_hours_start = 9,
      active_hours_end = 18,
      send_jitter_min = 5,
      send_jitter_max = 25,
      ramp_type = "linear",
      custom_ramp_caps,
      ai_provider = "openrouter",
      ai_prompt_template = "casual",
      custom_ai_key,
      reset_circuit_breaker = false,
    } = req.body;

    const account = db.prepare("SELECT id FROM email_accounts WHERE id = ? AND workspace_id = ?").get(email_account_id, ctx.workspaceId);
    if (!account) return res.status(404).json({ error: "Email account not found" });

    const clamp = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
    };
    const maxTarget = clamp(max_daily_target ?? daily_target, 1, 100, 5);
    const rampIncrement = clamp(ramp_increment, 1, 20, 2);
    const startVolume = clamp(start_volume, 1, 20, 2);
    const replyRate = clamp(reply_rate, 0, 100, 60);
    const aiEnabled = ai_content_enabled !== false ? 1 : 0;
    const enabledInt = enabled ? 1 : 0;
    const activeHrsStart = clamp(active_hours_start, 0, 23, 9);
    const activeHrsEnd = clamp(active_hours_end, 0, 24, 18);
    const jitterMin = clamp(send_jitter_min, 1, 60, 5);
    const jitterMax = clamp(send_jitter_max, 1, 120, 25);
    const customCapsStr = custom_ramp_caps ? JSON.stringify(custom_ramp_caps) : null;
    const aiKeyToStore = custom_ai_key ? encryptSecret(custom_ai_key) : null;

    let updateQuery = `
      INSERT INTO warmup_settings
        (email_account_id, workspace_id, enabled, daily_target, reply_rate,
         max_daily_target, ramp_increment, start_volume, ai_content_enabled, 
         pool_id, timezone, active_hours_start, active_hours_end, send_jitter_min, send_jitter_max,
         ramp_type, custom_ramp_caps, ai_provider, ai_prompt_template, custom_ai_key, paused_reason,
         started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CASE WHEN ? THEN datetime('now') ELSE NULL END, datetime('now'))
      ON CONFLICT(email_account_id) DO UPDATE SET
        enabled = excluded.enabled,
        daily_target = excluded.daily_target,
        reply_rate = excluded.reply_rate,
        max_daily_target = excluded.max_daily_target,
        ramp_increment = excluded.ramp_increment,
        start_volume = excluded.start_volume,
        ai_content_enabled = excluded.ai_content_enabled,
        pool_id = excluded.pool_id,
        timezone = excluded.timezone,
        active_hours_start = excluded.active_hours_start,
        active_hours_end = excluded.active_hours_end,
        send_jitter_min = excluded.send_jitter_min,
        send_jitter_max = excluded.send_jitter_max,
        ramp_type = excluded.ramp_type,
        custom_ramp_caps = excluded.custom_ramp_caps,
        ai_provider = excluded.ai_provider,
        ai_prompt_template = excluded.ai_prompt_template,
        custom_ai_key = COALESCE(excluded.custom_ai_key, warmup_settings.custom_ai_key),
        started_at = COALESCE(warmup_settings.started_at, excluded.started_at),
        updated_at = datetime('now')
    `;

    db.prepare(updateQuery).run(
      email_account_id, ctx.workspaceId, enabledInt, maxTarget, replyRate,
      maxTarget, rampIncrement, startVolume, aiEnabled,
      pool_id, timezone, activeHrsStart, activeHrsEnd, jitterMin, jitterMax,
      ramp_type, customCapsStr, ai_provider, ai_prompt_template, aiKeyToStore,
      enabledInt
    );

    if (reset_circuit_breaker || enabledInt) {
      db.prepare("UPDATE warmup_settings SET paused_reason = NULL WHERE email_account_id = ?").run(email_account_id);
    }

    db.prepare("UPDATE email_accounts SET ramp_up_enabled = ?, ramp_start_date = COALESCE(ramp_start_date, date('now')) WHERE id = ? AND workspace_id = ?")
      .run(enabledInt, email_account_id, ctx.workspaceId);

    // Warmup sends on-demand (no pre-scheduled backlog); nothing to queue up front here.
    recordAudit(ctx, "warmup.configured", "email_account", email_account_id, { enabled: !!enabled, max_daily_target: maxTarget, ramp_increment: rampIncrement, reply_rate: replyRate });
    return res.json({ ok: true, settings: { enabled: !!enabled, max_daily_target: maxTarget, ramp_increment: rampIncrement, start_volume: startVolume, reply_rate: replyRate, ai_content_enabled: !!aiEnabled } });
  }
  if (action === "placement_test") {
    const { email_account_id, seed_email } = req.body;
    const account = db.prepare("SELECT * FROM email_accounts WHERE id = ? AND workspace_id = ?").get(email_account_id, ctx.workspaceId) as Record<string, unknown> | undefined;
    if (!account || !seed_email) return res.status(400).json({ error: "email_account_id and seed_email are required" });
    const id = randomUUID();
    const subject = `[Outbount placement ${id.slice(0, 8)}] inbox test`;
    const receipt = await sendEmailDurably({ workspaceId: ctx.workspaceId, emailAccountId: email_account_id, idempotencyKey: `placement:${id}`, source: "placement", to: seed_email, subject, body: "This is an authorized inbox placement test from Outbount." });
    db.prepare(`INSERT INTO inbox_placement_tests (id, workspace_id, email_account_id, seed_email, subject, status, sent_at)
      VALUES (?, ?, ?, ?, ?, 'sent', datetime('now'))`).run(id, ctx.workspaceId, email_account_id, seed_email, subject);
    db.prepare("UPDATE inbox_placement_tests SET message_id=? WHERE id=?").run(receipt.messageId, id);
    recordAudit(ctx, "placement_test.sent", "inbox_placement_test", id, { seed_email });
    return res.status(201).json({ id, subject, status: "sent" });
  }
  if (action === "mark_placement") {
    const { id, placement } = req.body;
    if (!["inbox", "promotions", "spam", "missing"].includes(placement)) return res.status(400).json({ error: "Invalid placement" });
    db.prepare("UPDATE inbox_placement_tests SET placement = ?, status = 'checked', checked_at = datetime('now') WHERE id = ? AND workspace_id = ?").run(placement, id, ctx.workspaceId);
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "Unknown action" });
}
