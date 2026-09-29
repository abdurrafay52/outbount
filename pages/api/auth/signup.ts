import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { isRateLimited } from "@/lib/rate-limit";
import { createWorkspaceForUser } from "@/lib/workspace";
import { acceptWorkspaceInvitation, getInvitationByToken, normalizeInvitationEmail } from "@/lib/workspace-invitations";
import { signupSchema, firstIssue } from "@/lib/validation";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Basic rate limiting protection
  if (isRateLimited(req, "signup", 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  // Validate request body
  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: firstIssue(parsed.error, "Email and password are required.") });
  }
  const { email, password, invite_token } = parsed.data;

  const db = getDb();
  const normalizedEmail = normalizeInvitationEmail(email);

  // 1. Fetch invitation if a token was supplied
  const invitation = invite_token ? getInvitationByToken(invite_token) : null;

  // 2. Parse SUPERADMIN_EMAILS from your .env file (handles single or comma-separated emails)
  const allowedSuperadmins = (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => normalizeInvitationEmail(e.trim()))
    .filter(Boolean);

  const isSuperadmin = allowedSuperadmins.includes(normalizedEmail);

  // 3. Check if user holds a valid, pending invitation matching their email address
  const hasValidInvite = Boolean(
    invitation && invitation.status === "pending" && invitation.email === normalizedEmail
  );

  // 🔒 STRICT SECURITY GATE:
  // Reject registration if the email is NOT listed in SUPERADMIN_EMAILS AND has NO valid invitation token
  if (!isSuperadmin && !hasValidInvite) {
    return res.status(403).json({
      error: "Public registration is disabled. You must use an invitation link to create an account.",
    });
  }

  // Handle invalid/expired invite tokens explicitly
  if (invite_token && !hasValidInvite && !isSuperadmin) {
    return res.status(400).json({
      error: "This invitation is invalid, expired, or belongs to another email address.",
    });
  }

  // Prevent duplicate account registration
  const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  // Create user in database
  const hash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(userId, normalizedEmail, hash);

  try {
    if (invite_token && hasValidInvite) {
      acceptWorkspaceInvitation(invite_token, userId, normalizedEmail);
    } else {
      createWorkspaceForUser(userId, normalizedEmail);
    }
  } catch (error) {
    db.prepare("DELETE FROM users WHERE id=?").run(userId);
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to accept invitation" });
  }

  return res.status(201).json({ ok: true, workspace_id: invitation?.workspace_id });
}