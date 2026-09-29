import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";

interface ModelEntry {
  id: string;
  name: string;
}

/**
 * POST /api/settings/ai-providers/test
 *
 * Body: { base_url?: string; api_key?: string; provider_id?: string; save_models?: boolean }
 *
 * Tests whether a custom AI provider is reachable and the key is valid.
 * Hits <base_url>/models (OpenAI-compatible endpoint) and returns the model list.
 * If provider_id is given, the saved (decrypted) key is used when api_key is blank,
 * and if test succeeds, updates models_cache in custom_ai_providers table!
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const ctx = requireWorkspace(req, res, "admin");
  if (!ctx) return;

  const { base_url, api_key, provider_id, save_models } = req.body as {
    base_url?: string;
    api_key?: string;
    provider_id?: string;
    save_models?: boolean;
  };

  const db = getDb();
  let resolvedBaseUrl = base_url?.trim() || "";
  let resolvedKey = api_key?.trim() || null;

  if (provider_id) {
    const row = db
      .prepare("SELECT base_url, api_key FROM custom_ai_providers WHERE id=? AND workspace_id=?")
      .get(provider_id, ctx.workspaceId) as { base_url: string; api_key: string | null } | undefined;
    if (row) {
      if (!resolvedBaseUrl) resolvedBaseUrl = row.base_url;
      if (!resolvedKey) resolvedKey = decryptSecret(row.api_key ?? null);
    }
  }

  if (!resolvedBaseUrl) {
    return res.status(400).json({ error: "base_url is required" });
  }

  const cleanBase = resolvedBaseUrl.replace(/\/$/, "");
  const modelsUrl = `${cleanBase}/models`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (resolvedKey) headers["Authorization"] = `Bearer ${resolvedKey}`;

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);
    const upstream = await fetch(modelsUrl, { headers, signal: ctrl.signal });
    clearTimeout(timeout);

    const payload = await upstream.json() as {
      data?: ModelEntry[];
      models?: ModelEntry[];
      error?: { message?: string };
      object?: string;
    };

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: payload?.error?.message || `Provider returned HTTP ${upstream.status}`,
        models: [],
      });
    }

    // Normalise: OpenAI returns { object:"list", data:[...] }, Ollama returns { models:[{name,...}] }
    let rawModels: ModelEntry[] = [];
    if (Array.isArray(payload.data)) {
      rawModels = payload.data;
    } else if (Array.isArray(payload.models)) {
      rawModels = (payload.models as Array<{ name?: string; id?: string }>).map((m) => ({
        id: m.id ?? m.name ?? "",
        name: m.name ?? m.id ?? "",
      }));
    }

    const models = rawModels
      .filter((m) => m && (m.id || m.name))
      .map((m) => ({ id: m.id || m.name, name: m.name || m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));

    // If provider_id exists or save_models is requested, persist models_cache in DB
    if (provider_id && (save_models ?? true)) {
      try {
        db.prepare(
          "UPDATE custom_ai_providers SET models_cache=?, updated_at=datetime('now') WHERE id=? AND workspace_id=?"
        ).run(JSON.stringify(models), provider_id, ctx.workspaceId);
      } catch (e) {
        console.error("Failed to update models_cache", e);
      }
    }

    return res.json({ ok: true, models });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    return res.status(502).json({ error: `Could not reach provider: ${msg}`, models: [] });
  }
}
