import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { requireWorkspace, recordAudit } from "@/lib/workspace";


export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).end();
    }

    const db = getDb();
    const id = req.query.id as string;
    const ctx = requireWorkspace(req, res, "admin");
    if (!ctx) return;

    // Verify account exists in workspace
    const account = db.prepare("SELECT id FROM accounts WHERE id = ? AND workspace_id = ?").get(id, ctx.workspaceId);
    if (!account) return res.status(404).json({ error: "Not found" });

    try {
        // 1. Clear session cookies & mark as unauthenticated
        db.prepare(`
      UPDATE accounts 
      SET is_authenticated = 0, cookies_json = NULL 
      WHERE id = ? AND workspace_id = ?
    `).run(id, ctx.workspaceId);

        // 2. Stop live runner context
        // if (typeof markNeedsReauth === "function") markNeedsReauth(id);
        //if (typeof teardownAccountContext === "function") teardownAccountContext(id);

        recordAudit(ctx, "account.disconnected", "account", id);

        return res.json({ success: true, message: "Account disconnected successfully." });
    } catch (error: any) {
        console.error("Disconnect Error:", error);
        return res.status(500).json({ error: error.message || "Failed to disconnect account" });
    }
}