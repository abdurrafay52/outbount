import type { NextApiRequest, NextApiResponse } from "next";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { checkAllProxies } from "@/lib/proxy/checker";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = requireWorkspace(req, res, "member");
  if (!ctx) return;

  if (req.method === "POST") {
    try {
      await checkAllProxies(ctx.workspaceId);
      recordAudit(ctx, "proxies.bulk_checked", "proxy");
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Bulk proxy check failed" });
    }
  }

  res.setHeader("Allow", ["POST"]);
  res.status(405).end();
}
