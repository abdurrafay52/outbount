import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";

export interface ProviderModel {
  id: string;
  name: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "admin");
  if (!ctx) return;

  // GET — list all custom AI providers (api_key masked)
  if (req.method === "GET") {
    const rows = db
      .prepare(
        "SELECT id, name, base_url, api_key, default_model, models_cache, provider_type, created_at, updated_at FROM custom_ai_providers WHERE workspace_id = ? ORDER BY created_at ASC"
      )
      .all(ctx.workspaceId) as {
        id: string;
        name: string;
        base_url: string;
        api_key: string | null;
        default_model: string | null;
        models_cache: string | null;
        provider_type: string | null;
        created_at: string;
        updated_at: string;
      }[];

    const result = rows.map((r) => {
      const plain = decryptSecret(r.api_key);
      let parsedModels: ProviderModel[] = [];
      try {
        if (r.models_cache) {
          const parsed = JSON.parse(r.models_cache);
          if (Array.isArray(parsed)) parsedModels = parsed;
        }
      } catch {
        parsedModels = [];
      }

      return {
        id: r.id,
        name: r.name,
        base_url: r.base_url,
        api_key_masked: plain ? "••••••••" + plain.slice(-4) : null,
        has_key: !!plain,
        default_model: r.default_model || null,
        models: parsedModels,
        provider_type: r.provider_type || "custom",
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return res.json(result);
  }

  // POST — create a new custom AI provider
  if (req.method === "POST") {
    const { name, base_url, api_key, default_model, models_cache, provider_type } = req.body as {
      name?: string;
      base_url?: string;
      api_key?: string;
      default_model?: string;
      models_cache?: string | ProviderModel[];
      provider_type?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    if (!base_url?.trim()) return res.status(400).json({ error: "base_url is required" });

    const id = randomUUID();
    const cleanBaseUrl = base_url.trim().replace(/\/$/, "");
    const cleanApiKey = api_key?.trim() || null;
    const encryptedKey = cleanApiKey ? encryptSecret(cleanApiKey) : null;

    let modelsJson: string | null = null;
    let resolvedDefaultModel: string | null = default_model?.trim() || null;

    if (models_cache) {
      modelsJson = typeof models_cache === "string" ? models_cache : JSON.stringify(models_cache);
    } else if (cleanApiKey || cleanBaseUrl.includes("localhost") || cleanBaseUrl.includes("127.0.0.1")) {
      // Auto-fetch models if key or local
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (cleanApiKey) headers["Authorization"] = `Bearer ${cleanApiKey}`;
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 6000);
        const resp = await fetch(`${cleanBaseUrl}/models`, { headers, signal: ctrl.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          const payload = await resp.json() as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] };
          const raw = payload.data || payload.models || [];
          const fetched: ProviderModel[] = raw
            .filter((m) => m && (m.id || m.name))
            .map((m) => ({ id: m.id || m.name || "", name: m.name || m.id || "" }));
          if (fetched.length > 0) {
            modelsJson = JSON.stringify(fetched);
            if (!resolvedDefaultModel) resolvedDefaultModel = fetched[0].id;
          }
        }
      } catch {
        // Non-blocking fetch failure
      }
    }

    db.prepare(
      `INSERT INTO custom_ai_providers (id, workspace_id, name, base_url, api_key, default_model, models_cache, provider_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      id,
      ctx.workspaceId,
      name.trim(),
      cleanBaseUrl,
      encryptedKey,
      resolvedDefaultModel,
      modelsJson,
      provider_type || "custom"
    );

    return res.status(201).json({
      id,
      name: name.trim(),
      base_url: cleanBaseUrl,
      has_key: !!cleanApiKey,
      default_model: resolvedDefaultModel,
      models: modelsJson ? JSON.parse(modelsJson) : [],
      provider_type: provider_type || "custom",
    });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
