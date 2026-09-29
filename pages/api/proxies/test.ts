import type { NextApiRequest, NextApiResponse } from "next";
import { requireWorkspace } from "@/lib/workspace";
import { pingProxyConfig } from "@/lib/proxy/checker";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = requireWorkspace(req, res, "admin");
  if (!ctx) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const { host, port, protocol, username, password } = req.body;
  if (!host || !port || !protocol) {
    return res.status(400).json({ error: "Missing required proxy configuration" });
  }

  const result = await pingProxyConfig({ host, port: Number(port), protocol, username, password });
  
  if (result.status === "ACTIVE") {
    return res.json({ success: true, latency: result.responseTimeMs, location: result.location });
  } else {
    return res.json({ success: false, error: "Connection failed or timed out" });
  }
}
