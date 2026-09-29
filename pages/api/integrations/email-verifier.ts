import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const ctx = requireWorkspace(req, res, "admin");
    if (!ctx) return;

    const db = getDb();

    // GET: Load saved settings from workspace_integrations
    if (req.method === "GET") {
        const row = db
            .prepare("SELECT config FROM workspace_integrations WHERE workspace_id = ? AND provider = 'email_verifier'")
            .get(ctx.workspaceId) as { config: string } | undefined;

        if (!row) {
            return res.json({ provider: "millionverifier", api_key: "" });
        }

        try {
            return res.json(JSON.parse(row.config));
        } catch {
            return res.json({ provider: "millionverifier", api_key: "" });
        }
    }

    // POST: Save settings to workspace_integrations
    if (req.method === "POST") {
        const { provider, api_key } = req.body;

        if (!api_key) {
            return res.status(400).json({ error: "API Key is required" });
        }
        const isValid = await validateApiKey(provider, api_key);
        if (!isValid) {
            return res.status(400).json({ error: "Invalid API key or service unreachable" });
        }
        const configJson = JSON.stringify({ provider, api_key });

        db.prepare(`
      INSERT INTO workspace_integrations (id, workspace_id, provider, config, updated_at)
      VALUES (lower(hex(randomblob(16))), ?, 'email_verifier', ?, datetime('now'))
      ON CONFLICT(workspace_id, provider) DO UPDATE SET
        config = excluded.config,
        updated_at = datetime('now')
    `).run(ctx.workspaceId, configJson);

        return res.json({ success: true, message: "Email verifier integration saved successfully" });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end();
}
// Helper to test if API key actually works
async function validateApiKey(provider: string, apiKey: string): Promise<boolean> {
    try {
        if (provider === "millionverifier") {
            const res = await fetch(`https://api.millionverifier.com/api/v3/credits?api_key=${apiKey}`);
            const data = await res.json();
            return res.ok && data.credits !== undefined;
        }

        if (provider === "zerobounce") {
            const res = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${apiKey}`);
            const data = await res.json();
            return res.ok && data.credits !== undefined && data.credits !== "-1";
        }

        if (provider === "debounce") {
            const res = await fetch(`https://api.debounce.io/v1/?api=${apiKey}&search=test@example.com`);
            const data = await res.json();
            return res.ok && data.success === "1";
        }

        return false;
    } catch {
        return false;
    }
}