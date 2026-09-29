import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";

interface ModelItem {
  id: string;
  name: string;
  provider?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const ctx = requireWorkspace(req, res);
  if (!ctx) return;

  const db = getDb();
  const { provider_id } = req.query as { provider_id?: string };

  // 1. If a specific custom provider is requested
  if (provider_id && provider_id !== "openrouter" && provider_id !== "__default__") {
    const prov = db
      .prepare("SELECT id, name, base_url, api_key, models_cache FROM custom_ai_providers WHERE id = ? AND workspace_id = ?")
      .get(provider_id, ctx.workspaceId) as {
        id: string;
        name: string;
        base_url: string;
        api_key: string | null;
        models_cache: string | null;
      } | undefined;

    if (!prov) {
      return res.status(404).json({ error: "Provider not found", models: [] });
    }

    const apiKey = decryptSecret(prov.api_key);
    const cleanBase = prov.base_url.replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const upstream = await fetch(`${cleanBase}/models`, { headers, signal: ctrl.signal });
      clearTimeout(timeout);

      if (upstream.ok) {
        const payload = await upstream.json() as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] };
        const raw = payload.data || payload.models || [];
        const models: ModelItem[] = raw
          .filter(m => m && (m.id || m.name))
          .map(m => ({
            id: m.id || m.name || "",
            name: m.name || m.id || "",
            provider: prov.name,
          }));

        // Update cached models
        try {
          db.prepare("UPDATE custom_ai_providers SET models_cache = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(models), prov.id);
        } catch {}

        return res.json({ models });
      }
    } catch {
      // If live fetch fails, fall back to cached models if available
      if (prov.models_cache) {
        try {
          const cached = JSON.parse(prov.models_cache);
          if (Array.isArray(cached) && cached.length > 0) {
            return res.json({ models: cached.map(m => ({ ...m, provider: prov.name })) });
          }
        } catch {}
      }
    }

    return res.status(502).json({ error: `Could not fetch models from ${prov.name}`, models: [] });
  }

  // 2. Default OpenRouter check
  const row = db
    .prepare("SELECT api_key FROM integrations WHERE key = 'openrouter' AND workspace_id = ?")
    .get(ctx.workspaceId) as { api_key: string | null } | undefined;
  const orApiKey = decryptSecret(row?.api_key ?? null);

  if (orApiKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${orApiKey}` },
      });
      const payload = await response.json() as { data?: { id?: string; name?: string }[]; error?: { message?: string } };
      if (response.ok && Array.isArray(payload.data)) {
        const models = payload.data
          .filter((model): model is Required<{ id: string; name: string }> => !!model.id && !!model.name)
          .map((model) => ({ id: model.id, name: model.name, provider: model.id.split("/")[0] || "other" }))
          .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

        return res.json({ models });
      }
    } catch (error) {
      console.error("[openrouter-models]", error);
    }
  }

  // 3. Fallback: If no OpenRouter key or OpenRouter failed, check custom_ai_providers
  const customProviders = db
    .prepare("SELECT id, name, base_url, api_key, models_cache FROM custom_ai_providers WHERE workspace_id = ? ORDER BY created_at ASC")
    .all(ctx.workspaceId) as Array<{
      id: string;
      name: string;
      base_url: string;
      api_key: string | null;
      models_cache: string | null;
    }>;

  if (customProviders.length > 0) {
    const allModels: ModelItem[] = [];
    for (const prov of customProviders) {
      if (prov.models_cache) {
        try {
          const parsed = JSON.parse(prov.models_cache);
          if (Array.isArray(parsed)) {
            allModels.push(...parsed.map(m => ({ id: m.id, name: m.name || m.id, provider: prov.name })));
            continue;
          }
        } catch {}
      }
      // If no cache, try fetching from first provider
      const key = decryptSecret(prov.api_key);
      const cleanBase = prov.base_url.replace(/\/$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) headers["Authorization"] = `Bearer ${key}`;
      try {
        const r = await fetch(`${cleanBase}/models`, { headers });
        if (r.ok) {
          const payload = await r.json() as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] };
          const raw = payload.data || payload.models || [];
          const fetched = raw
            .filter(m => m && (m.id || m.name))
            .map(m => ({ id: m.id || m.name || "", name: m.name || m.id || "", provider: prov.name }));
          allModels.push(...fetched);
        }
      } catch {}
    }

    if (allModels.length > 0) {
      return res.json({ models: allModels });
    }
  }

  return res.status(400).json({
    error: "No AI provider is configured. Add OpenRouter or a custom AI provider in Settings → Integrations.",
    models: [],
  });
}
