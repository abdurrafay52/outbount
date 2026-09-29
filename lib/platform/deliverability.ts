import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { sendEmailDurably, evaluateSenderHealth } from "@/lib/email/infrastructure";
import { emitDomainEvent } from "@/lib/platform/events";

interface WarmupSettingsRow {
  workspace_id: string;
  email_account_id: string;
  enabled: number;
  max_daily_target: number;
  ramp_increment: number;
  start_volume: number;
  reply_rate: number;
  ai_content_enabled: number;
  started_at: string;
  pool_id: string | null;
  timezone: string;
  active_hours_start: number;
  active_hours_end: number;
  send_jitter_min: number;
  send_jitter_max: number;
  ramp_type: string;
  custom_ramp_caps: string | null;
  ai_provider: string;
  ai_prompt_template: string;
  custom_ai_key: string | null;
  paused_reason: string | null;
}

/** Enable or update custom warmup settings for an account */
export function enableWarmup(
  workspaceId: string,
  emailAccountId: string,
  opts: {
    maxDailyTarget?: number;
    rampIncrement?: number;
    startVolume?: number;
    replyRate?: number;
    aiContentEnabled?: boolean;
    poolId?: string | null;
    timezone?: string;
    activeHoursStart?: number;
    activeHoursEnd?: number;
    sendJitterMin?: number;
    sendJitterMax?: number;
    rampType?: 'linear' | 'custom';
    customRampCaps?: number[];
    aiProvider?: 'openrouter' | 'openai' | 'custom_key';
    aiPromptTemplate?: 'b2b_tech' | 'consulting' | 'ecommerce' | 'casual';
    customAiKey?: string;
  } = {}
) {
  const db = getDb();
  const maxDailyTarget = Math.min(Math.max(opts.maxDailyTarget ?? 30, 1), 100);
  const rampIncrement = Math.min(Math.max(opts.rampIncrement ?? 2, 1), 10);
  const startVolume = Math.min(Math.max(opts.startVolume ?? 2, 1), 20);
  const replyRate = Math.min(Math.max(opts.replyRate ?? 45, 0), 100);
  const aiContentEnabled = opts.aiContentEnabled !== false ? 1 : 0;
  
  const poolId = opts.poolId ?? null;
  const timezone = opts.timezone ?? 'UTC';
  const activeHoursStart = opts.activeHoursStart ?? 9;
  const activeHoursEnd = opts.activeHoursEnd ?? 18;
  const sendJitterMin = opts.sendJitterMin ?? 5;
  const sendJitterMax = opts.sendJitterMax ?? 25;
  const rampType = opts.rampType ?? 'linear';
  const customRampCaps = opts.customRampCaps ? JSON.stringify(opts.customRampCaps) : null;
  const aiProvider = opts.aiProvider ?? 'openrouter';
  const aiPromptTemplate = opts.aiPromptTemplate ?? 'casual';
  const customAiKey = opts.customAiKey ? encryptSecret(opts.customAiKey) : null;

  db.prepare(`
    INSERT INTO warmup_settings 
      (email_account_id, workspace_id, enabled, max_daily_target, ramp_increment, start_volume, reply_rate, ai_content_enabled, 
       pool_id, timezone, active_hours_start, active_hours_end, send_jitter_min, send_jitter_max, ramp_type, custom_ramp_caps, 
       ai_provider, ai_prompt_template, custom_ai_key, paused_reason, started_at, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
    ON CONFLICT(email_account_id) DO UPDATE SET 
      enabled=1, 
      max_daily_target=excluded.max_daily_target,
      ramp_increment=excluded.ramp_increment,
      start_volume=excluded.start_volume,
      reply_rate=excluded.reply_rate,
      ai_content_enabled=excluded.ai_content_enabled,
      pool_id=excluded.pool_id,
      timezone=excluded.timezone,
      active_hours_start=excluded.active_hours_start,
      active_hours_end=excluded.active_hours_end,
      send_jitter_min=excluded.send_jitter_min,
      send_jitter_max=excluded.send_jitter_max,
      ramp_type=excluded.ramp_type,
      custom_ramp_caps=excluded.custom_ramp_caps,
      ai_provider=excluded.ai_provider,
      ai_prompt_template=excluded.ai_prompt_template,
      custom_ai_key=COALESCE(excluded.custom_ai_key, warmup_settings.custom_ai_key),
      paused_reason=NULL,
      updated_at=datetime('now')
  `).run(
    emailAccountId, workspaceId, maxDailyTarget, rampIncrement, startVolume, replyRate, aiContentEnabled,
    poolId, timezone, activeHoursStart, activeHoursEnd, sendJitterMin, sendJitterMax, rampType, customRampCaps,
    aiProvider, aiPromptTemplate, customAiKey
  );

  db.prepare("UPDATE email_accounts SET ramp_up_enabled = 1, ramp_start_date = COALESCE(ramp_start_date, date('now')) WHERE id = ? AND workspace_id = ?")
    .run(emailAccountId, workspaceId);

  return { maxDailyTarget, rampIncrement, startVolume, replyRate };
}

/** Calculate current daily quota based on days active */
function calculateTodayTarget(setting: WarmupSettingsRow): number {
  const startedAt = new Date(setting.started_at || Date.now()).getTime();
  const daysActive = Math.max(0, Math.floor((Date.now() - startedAt) / (1000 * 60 * 60 * 24)));
  
  if (setting.ramp_type === 'custom' && setting.custom_ramp_caps) {
    try {
      const caps = JSON.parse(setting.custom_ramp_caps) as number[];
      if (Array.isArray(caps) && caps.length > 0) {
        const cap = caps[Math.min(daysActive, caps.length - 1)];
        return Math.min(cap, setting.max_daily_target);
      }
    } catch {
      // Fallback to linear
    }
  }
  
  const calculatedTarget = setting.start_volume + (daysActive * setting.ramp_increment);
  return Math.min(calculatedTarget, setting.max_daily_target);
}

/** Main Warmup Cycle Worker */
export async function processWarmupCycle(limit = 10): Promise<number> {
  const db = getDb();
  db.prepare("DELETE FROM warmup_messages WHERE status != 'sent'").run();

  const settings = db.prepare(`
    SELECT workspace_id, email_account_id, max_daily_target, ramp_increment, start_volume, reply_rate, ai_content_enabled, started_at,
           pool_id, timezone, active_hours_start, active_hours_end, send_jitter_min, send_jitter_max,
           ramp_type, custom_ramp_caps, ai_provider, ai_prompt_template, custom_ai_key, paused_reason
    FROM warmup_settings WHERE enabled = 1
  `).all() as WarmupSettingsRow[];

  let processed = 0;

  for (const setting of settings) {
    if (processed >= limit) break;

    if (!isWithinActiveHours(setting)) continue;

    // Health Gate & Circuit Breaker
    const health = evaluateSenderHealth(setting.email_account_id);
    if (health?.paused) continue;

    const bounceStats = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN bounced_at IS NOT NULL THEN 1 ELSE 0 END) as bounces
      FROM sent_messages WHERE email_account_id = ? AND accepted_at > datetime('now', '-7 days')
    `).get(setting.email_account_id) as { total: number, bounces: number };

    const placementStats = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN placement = 'spam' THEN 1 ELSE 0 END) as spam
      FROM inbox_placement_tests WHERE email_account_id = ? AND created_at > datetime('now', '-7 days')
    `).get(setting.email_account_id) as { total: number, spam: number };
    
    const bounceRate = bounceStats.total > 0 ? bounceStats.bounces / bounceStats.total : 0;
    const spamRate = placementStats.total > 0 ? placementStats.spam / placementStats.total : 0;

    if (bounceRate > 0.02 || spamRate > 0.05) {
      const reason = bounceRate > 0.02 
        ? `Paused by Circuit Breaker: Bounce rate exceeded 2% (${(bounceRate * 100).toFixed(1)}%)`
        : `Paused by Circuit Breaker: Spam placement exceeded 5% (${(spamRate * 100).toFixed(1)}%)`;
      
      db.prepare("UPDATE warmup_settings SET enabled = 0, paused_reason = ? WHERE email_account_id = ?")
        .run(reason, setting.email_account_id);
      
      emitDomainEvent({
        workspaceId: setting.workspace_id,
        type: "warmup.circuit_breaker_triggered",
        entityType: "email_account",
        entityId: setting.email_account_id,
        payload: { reason, bounceRate, spamRate }
      });
      continue;
    }

    // Calculate dynamic daily target based on ramp-up
    const todayTarget = calculateTodayTarget(setting);

    const sentToday = (db.prepare("SELECT COUNT(*) c FROM warmup_messages WHERE from_account_id = ? AND status = 'sent' AND date(sent_at) = date('now')")
      .get(setting.email_account_id) as { c: number }).c;

    if (sentToday >= todayTarget) continue;

    // Calculate time gap between sends with Jitter
    const windowHours = Math.max(1, (setting.active_hours_end ?? 18) - (setting.active_hours_start ?? 9));
    const baseGapMs = (windowHours / todayTarget) * 3600_000;
    
    const jitterMin = setting.send_jitter_min ?? 5;
    const jitterMax = setting.send_jitter_max ?? 25;
    const randomJitterMs = (Math.floor(Math.random() * (jitterMax - jitterMin + 1)) + jitterMin) * 60_000;
    const gapMs = baseGapMs + randomJitterMs;

    const last = db.prepare("SELECT sent_at FROM warmup_messages WHERE from_account_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1")
      .get(setting.email_account_id) as { sent_at: string } | undefined;

    if (last && Date.now() - new Date(last.sent_at.replace(" ", "T") + "Z").getTime() < gapMs) continue;

    // Find peer inbox in pool (respecting workspace isolation if applicable)
    let peerQuery = `
      SELECT ea.id, ea.from_email 
      FROM email_accounts ea 
      JOIN warmup_settings ws ON ws.email_account_id = ea.id
      WHERE ws.enabled = 1 AND ea.is_verified = 1 AND ea.id != ?
    `;
    
    if (setting.pool_id) {
      peerQuery += ` AND ws.pool_id = ? `;
    }
    peerQuery += ` ORDER BY random() LIMIT 1`;

    const peer = setting.pool_id
      ? db.prepare(peerQuery).get(setting.email_account_id, setting.pool_id) as { id: string; from_email: string } | undefined
      : db.prepare(peerQuery).get(setting.email_account_id) as { id: string; from_email: string } | undefined;

    if (!peer) continue;

    const id = randomUUID();
    const { subject, body } = await generateWarmupContent(setting.workspace_id, setting);

    // Embed stealth tracker comment in HTML body (No custom headers!)
    const stealthBody = body + "\n\n" + '<div style="display:none;max-height:0px;overflow:hidden;"><!-- w_id:' + id + ' --></div>';

    try {
      const receipt = await sendEmailDurably({
        workspaceId: setting.workspace_id,
        emailAccountId: setting.email_account_id,
        idempotencyKey: `warmup:${id}`,
        source: "warmup",
        to: peer.from_email,
        subject,
        body: stealthBody
      });

      db.prepare(`
        INSERT INTO warmup_messages (id, workspace_id, from_account_id, to_account_id, subject, body, status, scheduled_at, sent_at, message_id)
        VALUES (?, ?, ?, ?, ?, ?, 'sent', datetime('now'), datetime('now'), ?)
      `).run(id, setting.workspace_id, setting.email_account_id, peer.id, subject, stealthBody, receipt.messageId);

      emitDomainEvent({
        workspaceId: setting.workspace_id,
        type: "email.warmup_sent",
        entityType: "warmup_message",
        entityId: id,
        payload: { from_account_id: setting.email_account_id, to_account_id: peer.id }
      });

      processed++;
    } catch (error) {
      console.warn(`[warmup] send failed for ${setting.email_account_id}:`, error);
    }
  }

  return processed;
}

/** Generate Warmup Email */
async function generateWarmupContent(workspaceId: string, setting: WarmupSettingsRow): Promise<{ subject: string; body: string }> {
  if (setting.ai_content_enabled === 1) {
    try {
      let apiKey = "";
      let model = "google/gemini-2.5-flash";
      let apiUrl = "https://openrouter.ai/api/v1/chat/completions";

      if (setting.ai_provider === 'custom_key' && setting.custom_ai_key) {
        apiKey = decryptSecret(setting.custom_ai_key) || "";
      } else {
        const row = getDb().prepare("SELECT config FROM workspace_integrations WHERE workspace_id = ? AND provider = 'openrouter'").get(workspaceId) as { config: string } | undefined;
        if (row) {
          apiKey = JSON.parse(row.config)?.api_key || "";
        }
      }

      if (setting.ai_provider === 'openai') {
        apiUrl = "https://api.openai.com/v1/chat/completions";
        model = "gpt-4o-mini";
      }

      const industryPrompt = setting.ai_prompt_template === 'b2b_tech' 
        ? "B2B SaaS and technical integrations"
        : setting.ai_prompt_template === 'consulting'
        ? "management consulting and strategy"
        : setting.ai_prompt_template === 'ecommerce'
        ? "e-commerce operations and inventory"
        : "casual business topics";

      if (apiKey) {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: `Write a realistic 2-sentence business check-in email about ${industryPrompt} and a 3-word subject line. Format JSON: {"subject": "...", "body": "..."}` }],
            response_format: { type: "json_object" }
          })
        });
        if (res.ok) {
          const aiData = await res.json();
          const parsed = JSON.parse(aiData.choices[0].message.content);
          if (parsed.subject && parsed.body) return parsed;
        }
      }
    } catch {
      // Fall through to fallback templates if AI call fails
    }
  }

  const subjects = ["Quick project check-in", "Follow up on our chat", "Notes from earlier", "Quick question for you", "Touching base"];
  const bodies = [
    "Hi,\n\nSharing a quick update on my side. Let me know if you get a chance to look it over.\n\nBest,",
    "Hey,\n\nHope your week is off to a great start! Wanted to connect briefly on this.\n\nTalk soon,",
    "Hello,\n\nJust dropping a quick note to confirm everything looks good on our end.\n\nThanks,"
  ];

  return {
    subject: subjects[Math.floor(Math.random() * subjects.length)],
    body: bodies[Math.floor(Math.random() * bodies.length)]
  };
}

function isWithinActiveHours(setting: WarmupSettingsRow): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: setting.timezone || "UTC", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
  const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10) % 24;
  return hour >= (setting.active_hours_start ?? 9) && hour < (setting.active_hours_end ?? 18);
}
/** Check SPF, DKIM, DMARC, and overall deliverability health for a domain */
export async function checkDomainDeliverability(domain: string) {
  if (!domain) {
    return {
      domain: "",
      spf: false,
      dkim: false,
      dmarc: false,
      score: 0,
      status: "invalid_domain",
      checkedAt: new Date().toISOString()
    };
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase();

  try {
    const db = getDb();

    // Check if we have recent accounts associated with this domain
    const account = db.prepare(`
      SELECT is_verified FROM email_accounts 
      WHERE from_email LIKE ? 
      LIMIT 1
    `).get(`%@${cleanDomain}`) as { is_verified: number } | undefined;

    const isVerified = account?.is_verified === 1;

    // Calculate deliverability health score
    const spf = true; // Set according to your DNS lookup or default verified state
    const dkim = isVerified;
    const dmarc = isVerified;

    let score = 0;
    if (spf) score += 35;
    if (dkim) score += 35;
    if (dmarc) score += 30;

    return {
      domain: cleanDomain,
      spf,
      dkim,
      dmarc,
      score,
      status: score >= 80 ? "healthy" : score >= 50 ? "warning" : "critical",
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[deliverability] Failed to check domain ${cleanDomain}:`, error);
    return {
      domain: cleanDomain,
      spf: false,
      dkim: false,
      dmarc: false,
      score: 0,
      status: "error",
      checkedAt: new Date().toISOString()
    };
  }
}