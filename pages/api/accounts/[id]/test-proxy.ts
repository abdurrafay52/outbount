import type { NextApiRequest, NextApiResponse } from "next";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { getDb } from "@/lib/db";
import { checkProxyHealth } from "@/lib/proxy/checker";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  const type = (req.query.type as string) || 'primary';
  const ctx = requireWorkspace(req, res, "member");
  if (!ctx) return;

  if (req.method === "POST") {
    const db = getDb();

    const account = db.prepare(`SELECT proxy_id, backup_proxy_id FROM accounts WHERE id = ? AND workspace_id = ?`).get(id, ctx.workspaceId) as { proxy_id: string | null, backup_proxy_id: string | null };

    if (!account) return res.status(404).json({ error: "Account not found" });

    const targetProxyId = type === 'backup' ? account.backup_proxy_id : account.proxy_id;

    if (!targetProxyId) {
      return res.status(400).json({ error: `Account has no ${type} proxy assigned` });
    }

    try {
      let status = "ERROR";
      let responseTime = 0;

      try {
        const result = await checkProxyHealth(targetProxyId, ctx.workspaceId);
        status = result.status;
        responseTime = result.response_time_ms || 0;
      } catch (checkErr) {
        status = "ERROR";
      }

      // Save status to the correct table based on type
      if (type === 'backup') {
        db.prepare(`UPDATE accounts SET backup_proxy_status = ? WHERE id = ?`).run(status, id);
      } else {
        db.prepare(`UPDATE proxies SET status = ? WHERE id = ?`).run(status, targetProxyId);
      }

      recordAudit(ctx, `account.${type}_proxy_tested`, "account", id, { status, latency: responseTime });

      return res.json({ status, response_time_ms: responseTime });

    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Proxy test failed" });
    }
  }

  res.setHeader("Allow", ["POST"]);
  res.status(405).end();
}