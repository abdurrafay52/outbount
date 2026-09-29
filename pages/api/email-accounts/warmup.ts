import type { NextApiRequest, NextApiResponse } from "next";
import { enableWarmup } from "../../../lib/platform/deliverability";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { emailAccountId, workspaceId = "default", maxDailyTarget, rampIncrement, replyRate, aiContentEnabled } = req.body;

        if (!emailAccountId) {
            return res.status(400).json({ error: "Missing emailAccountId" });
        }

        const updated = enableWarmup(workspaceId, emailAccountId, {
            maxDailyTarget,
            rampIncrement,
            replyRate,
            aiContentEnabled,
        });

        return res.status(200).json({ success: true, settings: updated });
    } catch (error) {
        console.error("Failed to update warmup settings:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}