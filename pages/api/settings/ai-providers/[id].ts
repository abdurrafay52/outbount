import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";

export interface ProviderModel {
  id: string;
  name: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const ctx = requireWorkspace(req, res, "admin");
  if (!ctx) return;

  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "invalid id" });

  // Verify provider belongs to this workspace
  const existing = db
    .prepare("SELECT id, base_url, api_key, default_model, models_cache, provider_type FROM custom_ai_providers WHERE id = ? AND workspace_id = ?")
    .get(id, ctx.workspaceId) as {
      id: string;
      base_url: string;
      api_key: string | null;
      default_model: string | null;
      models_cache: string | null;
      provider_type: string | null;
    } | undefined;
  if (!existing) return res.status(404).json({ error: "Provider not found" });

  // PUT — update name, base_url, default_model, models_cache, and optionally the api_key
  if (req.method === "PUT") {
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

    const cleanBaseUrl = base_url.trim().replace(/\/$/, "");
    let modelsJson: string | null = existing.models_cache;
    if (models_cache !== undefined) {
      modelsJson = typeof models_cache === "string" ? models_cache : JSON.stringify(models_cache);
    }

    const resolvedDefaultModel = default_model !== undefined ? (default_model?.trim() || null) : existing.default_model;
    const resolvedProviderType = provider_type !== undefined ? provider_type : (existing.provider_type || "custom");

    // Only overwrite the API key if a new value was supplied (non-empty string)
    if (api_key && api_key.trim()) {
      const encrypted = encryptSecret(api_key.trim());
      db.prepare(
        "UPDATE custom_ai_providers SET name=?, base_url=?, api_key=?, default_model=?, models_cache=?, provider_type=?, updated_at=datetime('now') WHERE id=? AND workspace_id=?"
      ).run(name.trim(), cleanBaseUrl, encrypted, resolvedDefaultModel, modelsJson, resolvedProviderType, id, ctx.workspaceId);
    } else {
      db.prepare(
        "UPDATE custom_ai_providers SET name=?, base_url=?, default_model=?, models_cache=?, provider_type=?, updated_at=datetime('now') WHERE id=? AND workspace_id=?"
      ).run(name.trim(), cleanBaseUrl, resolvedDefaultModel, modelsJson, resolvedProviderType, id, ctx.workspaceId);
    }

    // Return updated record
    const updated = db
      .prepare("SELECT id, name, base_url, api_key, default_model, models_cache, provider_type, updated_at FROM custom_ai_providers WHERE id=?")
      .get(id) as {
        id: string;
        name: string;
        base_url: string;
        api_key: string | null;
        default_model: string | null;
        models_cache: string | null;
        provider_type: string | null;
        updated_at: string;
      };

    const plain = decryptSecret(updated?.api_key ?? null);
    let parsedModels: ProviderModel[] = [];
    try {
      if (updated?.models_cache) {
        const parsed = JSON.parse(updated.models_cache);
        if (Array.isArray(parsed)) parsedModels = parsed;
      }
    } catch {
      parsedModels = [];
    }

    return res.json({
      id: updated.id,
      name: updated.name,
      base_url: updated.base_url,
      api_key_masked: plain ? "••••••••" + plain.slice(-4) : null,
      has_key: !!plain,
      default_model: updated.default_model,
      models: parsedModels,
      provider_type: updated.provider_type || "custom",
      updated_at: updated.updated_at,
    });
  }

  // DELETE — remove the provider
  if (req.method === "DELETE") {
    db.prepare("DELETE FROM custom_ai_providers WHERE id=? AND workspace_id=?").run(id, ctx.workspaceId);
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["PUT", "DELETE"]);
  return res.status(405).end();
}
