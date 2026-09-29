import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { requireWorkspace, recordAudit } from "@/lib/workspace";
import { assignEmailAccounts } from "@/lib/email/routing";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const ctx = requireWorkspace(req, res, req.method === "GET" ? "viewer" : "manager");
  if (!ctx) return;

  if (req.method === "GET") {
    const runs = db
      .prepare(
        `SELECT r.*,
                w.name as workflow_name,
                l.name as list_name,
                a.name as account_name,
                COUNT(DISTINCT rp.id) as total_profiles,
                COUNT(DISTINCT CASE WHEN NOT EXISTS (
                  SELECT 1 FROM run_profile_tracks rt2
                  WHERE rt2.run_profile_id = rp.id AND rt2.state NOT IN ('completed', 'failed', 'skipped')
                ) AND EXISTS (
                  SELECT 1 FROM run_profile_tracks rt3
                  WHERE rt3.run_profile_id = rp.id AND rt3.state = 'completed'
                ) THEN rp.id END) as completed_profiles
         FROM runs r
         LEFT JOIN workflows w ON w.id = r.workflow_id
         LEFT JOIN lists l ON l.id = r.list_id
         LEFT JOIN accounts a ON a.id = r.account_id
         LEFT JOIN run_profiles rp ON rp.run_id = r.id
         WHERE r.workspace_id = ?
         GROUP BY r.id
         ORDER BY r.created_at DESC`
      )
      .all(ctx.workspaceId);
    return res.json(runs);
  }

  if (req.method === "POST") {
    const { workflow_id, list_id, account_id, email_account_id, email_account_ids, target_ids, bounce_threshold_pct } = req.body;
    if (!workflow_id || !list_id)
      return res.status(400).json({ error: "workflow_id and list_id required" });

    // Per-campaign bounce auto-pause threshold (percent). Whole percent values 1–10; default 2.
    const rawThreshold = Number(bounce_threshold_pct);
    const bounceThresholdPct = Number.isFinite(rawThreshold) && rawThreshold > 0
      ? Math.min(10, Math.max(1, Math.round(rawThreshold)))
      : 2;
    const owned = db.prepare(`SELECT
      (SELECT campaign_type FROM workflows WHERE id = ? AND workspace_id = ?) AS campaign_type,
      EXISTS(SELECT 1 FROM lists WHERE id = ? AND workspace_id = ?) AS list_ok,
      EXISTS(SELECT 1 FROM accounts WHERE id = ? AND workspace_id = ?) AS account_ok`
    ).get(workflow_id, ctx.workspaceId, list_id, ctx.workspaceId, account_id, ctx.workspaceId) as { campaign_type: string | null; list_ok: number; account_ok: number };
    
    if (owned.campaign_type === null) return res.status(404).json({ error: "Workflow not found" });
    if (!owned.list_ok) return res.status(404).json({ error: "List not found" });
    
    // Determine which tracks this workflow has steps for
    const workflowTracks = [...new Set(
      (db.prepare("SELECT DISTINCT track FROM workflow_steps WHERE workflow_id = ?").all(workflow_id) as { track: string }[]).map(r => r.track)
    )];
    // If no track column exists yet (old DB), default to linkedin-only
    if (workflowTracks.length === 0) workflowTracks.push("linkedin");
    
    const hasLinkedInSteps = workflowTracks.includes("linkedin");
    if (hasLinkedInSteps && (!account_id || !owned.account_ok)) {
      return res.status(400).json({ error: "LinkedIn account required for campaigns with LinkedIn steps" });
    }

    // Normalise email account list — prefer the new array, fall back to legacy single-id
    const emailAccountPool: string[] = Array.isArray(email_account_ids) && email_account_ids.length > 0
      ? email_account_ids
      : (email_account_id ? [email_account_id] : []);

    const hasEmailSteps = workflowTracks.includes("email");
    if (hasEmailSteps && emailAccountPool.length === 0) {
      return res.status(400).json({ error: "Email account required for campaigns with Email steps" });
    }

    // Check 1: only one active run per workflow
    const activeRun = db.prepare(
      "SELECT id FROM runs WHERE workflow_id = ? AND workspace_id = ? AND status IN ('running', 'paused') LIMIT 1"
    ).get(workflow_id, ctx.workspaceId) as { id: string } | undefined;
    if (activeRun) {
      return res.status(400).json({
        error: "workflow_already_active",
        message: "This workflow is already running. Stop or pause it before enrolling a new list.",
      });
    }

    // Compute who can actually be enrolled BEFORE creating anything, so a no-op enroll (or a
    // failure part-way) never leaves an orphaned run or a stranded enrollment record.
    const runId = randomUUID();

    // Candidate targets — either the selected ids or all targets in the list
    const candidates: { target_id: string }[] = Array.isArray(target_ids) && target_ids.length > 0
      ? (target_ids as string[]).map((id) => ({ target_id: id }))
      : db.prepare("SELECT lt.target_id FROM list_targets lt JOIN targets t ON t.id = lt.target_id WHERE lt.list_id = ? AND t.workspace_id = ?").all(list_id, ctx.workspaceId) as { target_id: string }[];

    // Exclude targets already enrolled in any run of this workflow
    const alreadyEnrolled = new Set(
      (db.prepare(
        `SELECT DISTINCT rp.target_id FROM run_profiles rp
         JOIN runs r ON r.id = rp.run_id
         WHERE r.workflow_id = ? AND r.workspace_id = ?`
      ).all(workflow_id, ctx.workspaceId) as { target_id: string }[]).map((r) => r.target_id)
    );

    // Exclude targets currently active in any other running/paused workflow
    const activeElsewhere = new Set(
      (db.prepare(
        `SELECT DISTINCT rp.target_id FROM run_profiles rp
         JOIN runs r ON r.id = rp.run_id
         WHERE r.status IN ('running', 'paused') AND r.workspace_id = ?
         AND EXISTS (
           SELECT 1 FROM run_profile_tracks rt
           WHERE rt.run_profile_id = rp.id AND rt.state NOT IN ('completed', 'failed', 'skipped')
         )`
      ).all(ctx.workspaceId) as { target_id: string }[]).map((r) => r.target_id)
    );

    const targets = candidates.filter((t) => !alreadyEnrolled.has(t.target_id) && !activeElsewhere.has(t.target_id));

    if (targets.length === 0) {
      // No run was ever created, so there's nothing to clean up and nothing is left enrolled.
      return res.status(400).json({
        error: "all_already_enrolled",
        message: "All selected contacts are already enrolled in this workflow.",
      });
    }

    // Assign email accounts: MX-aware company-grouped routing
    const targetIdsForRouting = targets.map(t => t.target_id);
    const emailAssignment = await assignEmailAccounts(targetIdsForRouting, emailAccountPool);



    const insertProfile = db.prepare(
      "INSERT INTO run_profiles (id, run_id, target_id, email_account_id) VALUES (?, ?, ?, ?)"
    );
    const insertTrack = db.prepare(
      "INSERT INTO run_profile_tracks (id, run_profile_id, track, state, current_step) VALUES (?, ?, ?, 'pending', 0)"
    );
    // Create the run and all of its profiles/tracks in ONE transaction — any failure rolls
    // back the run AND its enrollments together, so neither can be left orphaned.
    db.transaction(() => {
      db.prepare("INSERT INTO runs (id, workspace_id, workflow_id, list_id, account_id, email_account_id, bounce_threshold_pct) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(runId, ctx.workspaceId, workflow_id, list_id, account_id || null, emailAccountPool[0] ?? null, bounceThresholdPct);
      for (const t of targets) {
        const assignedEmailAccountId = emailAssignment.get(t.target_id) ?? null;
        const rpId = randomUUID();
        insertProfile.run(rpId, runId, t.target_id, assignedEmailAccountId);
        for (const track of workflowTracks) {
          // Skip email track if no email account is configured on this run
          if (track === "email" && !assignedEmailAccountId) continue;
          insertTrack.run(randomUUID(), rpId, track);
        }
      }
    })();

    recordAudit(ctx, "run.created", "run", runId, { workflow_id, list_id, enrolled: targets.length });
    return res.status(201).json({ id: runId });
  }

  res.status(405).end();
}
