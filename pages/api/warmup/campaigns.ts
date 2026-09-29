import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { decryptSecret } from "@/lib/crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "member");
  if (!ctx) return;

  if (req.method === "GET") {
    // List all warmup campaigns with inbox counts
    const campaigns = db.prepare(`
      SELECT 
        wc.*,
        (SELECT COUNT(*) FROM warmup_campaign_inboxes WHERE campaign_id = wc.id) AS target_inbox_count,
        (SELECT COUNT(*) FROM warmup_campaign_peers WHERE campaign_id = wc.id) AS peer_inbox_count
      FROM warmup_campaigns wc
      WHERE wc.workspace_id = ?
      ORDER BY wc.created_at DESC
    `).all(ctx.workspaceId);

    // Email accounts for selection
    const emailAccounts = db.prepare(
      `SELECT id, name, from_email FROM email_accounts WHERE workspace_id = ? ORDER BY name ASC`
    ).all(ctx.workspaceId);

    // Custom AI providers from custom_ai_providers table
    const customAiProvidersRaw = db.prepare(
      `SELECT id, name, base_url, default_model, models_cache, provider_type, updated_at 
       FROM custom_ai_providers 
       WHERE workspace_id = ? 
       ORDER BY name ASC`
    ).all(ctx.workspaceId) as Array<{
      id: string;
      name: string;
      base_url: string;
      default_model: string | null;
      models_cache: string | null;
      provider_type: string | null;
      updated_at: string;
    }>;

    const customAiProviders = customAiProvidersRaw.map((p) => {
      let models: { id: string; name: string }[] = [];
      try {
        if (p.models_cache) {
          const parsed = JSON.parse(p.models_cache);
          if (Array.isArray(parsed)) models = parsed;
        }
      } catch {}
      return {
        id: p.id,
        name: p.name,
        base_url: p.base_url,
        default_model: p.default_model,
        models,
        provider_type: p.provider_type || "custom",
        updated_at: p.updated_at,
      };
    });

    // Saved AI providers (from integrations table - openrouter, openai-compatible etc)
    const aiIntegrations = db.prepare(
      `SELECT key, updated_at FROM integrations WHERE workspace_id = ? AND (key LIKE 'openrouter%' OR key LIKE 'openai%' OR key LIKE 'ai_%') ORDER BY updated_at DESC`
    ).all(ctx.workspaceId) as { key: string; updated_at: string }[];

    // Also pull workspace_ai_config custom base_url entries
    const aiConfig = db.prepare(
      `SELECT base_url, default_model FROM workspace_ai_config WHERE workspace_id = ?`
    ).get(ctx.workspaceId) as { base_url: string | null; default_model: string | null } | undefined;

    return res.json({ campaigns, emailAccounts, customAiProviders, aiIntegrations, aiConfig });
  }

  if (req.method === "POST") {
    const { action } = req.body as { action: string };

    if (action === "create_campaign") {
      const {
        name, description,
        target_inbox_ids,   // string[]
        peer_inbox_ids,     // string[]
        timezone, active_hours_start, active_hours_end,
        send_jitter_min, send_jitter_max,
        ramp_type, start_volume, ramp_increment, max_daily_target, custom_ramp_caps,
        reply_rate,
        ai_enabled, ai_provider_key, ai_model, ai_base_url, ai_system_prompt, ai_user_prompt, ai_examples,
        circuit_breaker_bounce_pct, circuit_breaker_spam_pct,
      } = req.body;

      if (!name) return res.status(400).json({ error: "Campaign name is required" });
      if (!target_inbox_ids?.length) return res.status(400).json({ error: "Select at least one target inbox" });

      // Verify all target inboxes belong to workspace
      for (const id of target_inbox_ids as string[]) {
        const acct = db.prepare("SELECT id FROM email_accounts WHERE id = ? AND workspace_id = ?").get(id, ctx.workspaceId);
        if (!acct) return res.status(400).json({ error: `Inbox ${id} not found` });
      }

      const id = randomUUID();
      const customCapsStr = custom_ramp_caps ? JSON.stringify(custom_ramp_caps) : null;

      // Resolve AI key and base URL
      let encryptedAiKey: string | null = null;
      let resolvedBaseUrl = ai_base_url ?? null;

      if (ai_provider_key && ai_provider_key !== "__workspace__" && ai_provider_key !== "__custom__") {
        // First check custom_ai_providers
        const customRow = db.prepare(
          "SELECT api_key, base_url FROM custom_ai_providers WHERE id = ? AND workspace_id = ?"
        ).get(ai_provider_key, ctx.workspaceId) as { api_key: string | null; base_url: string } | undefined;

        if (customRow) {
          encryptedAiKey = customRow.api_key;
          if (!resolvedBaseUrl) resolvedBaseUrl = customRow.base_url;
        } else {
          // Then check integrations table
          const integrationRow = db.prepare(
            "SELECT api_key FROM integrations WHERE key = ? AND workspace_id = ?"
          ).get(ai_provider_key, ctx.workspaceId) as { api_key: string } | undefined;
          if (integrationRow?.api_key) {
            encryptedAiKey = integrationRow.api_key;
          }
        }
      }

      db.prepare(`
        INSERT INTO warmup_campaigns 
          (id, workspace_id, name, description, status,
           timezone, active_hours_start, active_hours_end, send_jitter_min, send_jitter_max,
           ramp_type, start_volume, ramp_increment, max_daily_target, custom_ramp_caps, reply_rate,
           ai_enabled, ai_provider_key, ai_model, ai_base_url, ai_encrypted_key, ai_system_prompt, ai_user_prompt, ai_examples,
           circuit_breaker_bounce_pct, circuit_breaker_spam_pct,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active',
           ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?, ?, ?,
           ?, ?,
           datetime('now'), datetime('now'))
      `).run(
        id, ctx.workspaceId, name, description ?? null,
        timezone ?? "UTC", active_hours_start ?? 9, active_hours_end ?? 18, send_jitter_min ?? 5, send_jitter_max ?? 25,
        ramp_type ?? "linear", start_volume ?? 2, ramp_increment ?? 2, max_daily_target ?? 30, customCapsStr, reply_rate ?? 45,
        ai_enabled ? 1 : 0, ai_provider_key ?? null, ai_model ?? null, resolvedBaseUrl, encryptedAiKey,
        ai_system_prompt ?? null, ai_user_prompt ?? null, ai_examples ?? null,
        circuit_breaker_bounce_pct ?? 2, circuit_breaker_spam_pct ?? 5
      );

      // Insert target inboxes
      const insertTarget = db.prepare("INSERT INTO warmup_campaign_inboxes (id, campaign_id, email_account_id) VALUES (?, ?, ?)");
      for (const inboxId of target_inbox_ids as string[]) {
        insertTarget.run(randomUUID(), id, inboxId);
      }

      // Insert peer inboxes
      if (peer_inbox_ids?.length) {
        const insertPeer = db.prepare("INSERT INTO warmup_campaign_peers (id, campaign_id, email_account_id) VALUES (?, ?, ?)");
        for (const inboxId of peer_inbox_ids as string[]) {
          insertPeer.run(randomUUID(), id, inboxId);
        }
      }

      recordAudit(ctx, "warmup_campaign.created", "warmup_campaign", id, { name });
      return res.status(201).json({ ok: true, id });
    }

    if (action === "update_status") {
      const { campaign_id, status } = req.body;
      if (!["active", "paused", "archived"].includes(status)) return res.status(400).json({ error: "Invalid status" });
      db.prepare("UPDATE warmup_campaigns SET status = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?")
        .run(status, campaign_id, ctx.workspaceId);
      return res.json({ ok: true });
    }

    if (action === "delete_campaign") {
      const { campaign_id } = req.body;
      db.prepare("DELETE FROM warmup_campaign_inboxes WHERE campaign_id = ?").run(campaign_id);
      db.prepare("DELETE FROM warmup_campaign_peers WHERE campaign_id = ?").run(campaign_id);
      db.prepare("DELETE FROM warmup_campaigns WHERE id = ? AND workspace_id = ?").run(campaign_id, ctx.workspaceId);
      recordAudit(ctx, "warmup_campaign.deleted", "warmup_campaign", campaign_id);
      return res.json({ ok: true });
    }

    if (action === "fetch_models") {
      // Fetch available models from a provider key or custom base_url
      const { provider_key, base_url, api_key: rawApiKey } = req.body;
      let apiKey = "";
      let modelsUrl = "";
      let customProvId: string | null = null;

      if (provider_key && provider_key !== "__custom__" && provider_key !== "__workspace_ai__") {
        // Check custom_ai_providers first
        const customRow = db.prepare(
          "SELECT id, api_key, base_url, models_cache FROM custom_ai_providers WHERE id = ? AND workspace_id = ?"
        ).get(provider_key, ctx.workspaceId) as { id: string; api_key: string | null; base_url: string; models_cache: string | null } | undefined;

        if (customRow) {
          customProvId = customRow.id;
          if (customRow.api_key) apiKey = decryptSecret(customRow.api_key) || "";
          modelsUrl = `${customRow.base_url.replace(/\/$/, "")}/models`;
        } else {
          // Check integrations
          const row = db.prepare("SELECT api_key FROM integrations WHERE key = ? AND workspace_id = ?").get(provider_key, ctx.workspaceId) as { api_key: string } | undefined;
          if (row?.api_key) apiKey = decryptSecret(row.api_key) || "";
          if (provider_key.startsWith("openrouter")) modelsUrl = "https://openrouter.ai/api/v1/models";
          else if (provider_key.startsWith("openai")) modelsUrl = "https://api.openai.com/v1/models";
          else if (base_url) modelsUrl = `${base_url.replace(/\/$/, "")}/models`;
        }
      } else if (base_url) {
        modelsUrl = `${base_url.replace(/\/$/, "")}/models`;
        apiKey = rawApiKey || "";
      }

      if (!modelsUrl) return res.json({ models: [] });

      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(modelsUrl, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: ctrl.signal,
        });
        clearTimeout(timeout);

        const payload = await r.json() as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] };
        const raw = payload.data || payload.models || [];
        const models = raw
          .filter(m => m && (m.id || m.name))
          .map(m => ({ id: m.id || m.name || "", name: m.name || m.id || "" }));

        // Cache models if custom provider
        if (customProvId && models.length > 0) {
          try {
            db.prepare("UPDATE custom_ai_providers SET models_cache = ?, updated_at = datetime('now') WHERE id = ?")
              .run(JSON.stringify(models), customProvId);
          } catch {}
        }

        return res.json({ models });
      } catch {
        // Fallback to cached models if available
        if (customProvId) {
          const row = db.prepare("SELECT models_cache FROM custom_ai_providers WHERE id = ?").get(customProvId) as { models_cache: string | null } | undefined;
          if (row?.models_cache) {
            try {
              const cached = JSON.parse(row.models_cache);
              if (Array.isArray(cached) && cached.length > 0) return res.json({ models: cached });
            } catch {}
          }
        }
        return res.json({ models: [] });
      }
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).end();
}
