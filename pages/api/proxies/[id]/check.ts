import type { NextApiRequest, NextApiResponse } from "next";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { checkProxyHealth } from "@/lib/proxy/checker";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const ctx = requireWorkspace(req, res, "member");
  if (!ctx) return;

  if (req.method === "POST") {
    try {
      const result = await checkProxyHealth(id, ctx.workspaceId);
      recordAudit(ctx, "proxy.checked", "proxy", id, { status: result.status, latency: result.response_time_ms });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Proxy check failed" });
    }
  }

  res.setHeader("Allow", ["POST"]);
  res.status(405).end();
}
