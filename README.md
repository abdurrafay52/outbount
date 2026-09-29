<p align="center">
  <img src="public/logo.svg" alt="Outbount" width="64" />
</p>

<h1 align="center">Outbount</h1>
<p align="center">Open-source AI SDR for B2B outreach. LinkedIn sequences, cold email, and lead enrichment — self-hosted, no per-seat pricing.</p>

---

## What is Outbount

Outbount is an open-source AI SDR built for B2B founders and sales teams who want full control over their outreach. You build multichannel campaigns — LinkedIn sequences, cold email, or both — enrich your leads, and run everything on your own server. Your data never leaves your machine.

No SaaS middleman. No per-seat pricing. No black box.

---

## Features

### 📬 Multichannel Campaigns

- **LinkedIn + email in one campaign**: run LinkedIn actions (visit, connect, message) and email actions in parallel within a single campaign sequence
- **Flexible step builder**: chain visit → connect → delay → message → cold email in any order, with configurable delays between steps
- **Per-lead state tracking**: see exactly where every lead is across both channels, with a live pipeline view broken down by step and status
- **A/B template pools**: assign multiple message templates to a step and rotate them automatically

### 🔐 Server-Side LinkedIn Login

- **Headless server-side authentication**: log in to LinkedIn directly on your server — no cookie-pasting — so the session is born under the exact browser fingerprint the automation runs with
- **Handles LinkedIn's real challenges**: email/SMS codes **and** mobile-app device approval, plus LinkedIn's dynamic React login fields
- **Longer, more stable sessions**: a pinned browser fingerprint keeps sessions alive far longer, enabling more complex and more frequent LinkedIn activity without forced logouts
- **Captures the full session**: including the httpOnly Sales Navigator seat cookie that cookie-paste can't reach — so Sales Nav import and enrichment just work

### 🔍 Data & Enrichment

- **Sales Navigator import**: paste a list URL and Outbount pulls in all leads with name, title, company, location, seniority, and LinkedIn URL
- **CSV import**: bring in leads from anywhere else — a downloadable template covers LinkedIn URL, Sales Nav URL, email, and every contact field; each row just needs a LinkedIn URL and/or an email, so LinkedIn-only, email-only, and mixed lists all work
- **Batched & scheduled imports**: large lists split across days automatically under a global daily cap, with human-like pacing so imports never look like a bot burst
- **Apollo.io enrichment**: connect your Apollo API key and enrich any list with verified email addresses, company data, and seniority in one click
- **Sales Nav profile enrichment**: pull richer profile data (headline, positions) for better targeting, gathered at runner time to stay under the radar
- **Company model**: enriched company records (description, headcount, industry, location) linked from contacts; never duplicated across leads
- **Contact detail pages**: full profile view with outreach history, enrichment status, and all campaign activity per contact

### 📥 Unified Inbox

- **Aggregated reply feed**: all email replies from active campaigns surface in one inbox regardless of which email account received them
- **Email + LinkedIn reply detection**: the runner passively monitors both email and LinkedIn conversations and flags contacts who replied
- **Reply filtering**: only shows contacts who actually replied; noise-free by design
- **Inline reply composer**: read the full email thread and reply without leaving Outbount
- **Reply intelligence**: classifies positive, negative, out-of-office, unsubscribe, and ambiguous replies and dispatches the safe next action
- **Team inbox controls**: assignment, expiring collision locks, tags, saved replies, bulk status/assignment, SLA due dates, sentiment, and overdue filters

### 🧩 Revenue Platform

- **Isolated team workspaces and RBAC**: owner, admin, manager, member, and viewer roles; tenant-scoped records; audit logs; encrypted secrets; per-workspace API keys; expiring email invitations; and workspace switching
- **Conditional campaigns**: forward-only branches on connected/replied state, email availability, intent score, signals, target properties, and custom CRM fields
- **Global suppression/DNC**: email, domain, LinkedIn, and phone suppression checked immediately before every automated and manual send
- **Deliverability center**: live SPF, DKIM, DMARC and MX checks, sender-health scoring, placement tests, bounce-rate recommendations, and reciprocal mailbox warmup
- **Signals and scoring**: job-change, funding, hiring, technology, product-intent, and custom signals can raise intent and enroll contacts through configurable rules
- **CRM, calendar, and revenue**: two-way HubSpot/Salesforce contact synchronization, incremental Google/Microsoft Calendar or iCal ingestion, meeting attribution, opportunity stages, owners, weighted pipeline, and won revenue
- **Public API and webhooks**: hashed scoped API keys, versioned `/api/v1` resources, durable domain events, HMAC-signed delivery, exponential retries, and dead-letter state
- **MCP-native operation**: Streamable HTTP, OAuth 2.1/PKCE, dynamic client registration, workspace-bound access tokens, dedicated tools for every platform area, resources, prompts, and MCP audit logs

### ⚡ Reliability & Safety

- **Pinned browser fingerprint**: Chromium and its base image are version-pinned so a rebuild never changes the fingerprint LinkedIn sees — the single biggest cause of forced logouts, eliminated
- **63% improvement in connection reliability**: rewritten LinkedIn automation with smarter DOM targeting, clipboard-based message delivery, and graceful handling of LinkedIn's UI variants
- **Human-like import behavior**: lead list imports use randomized delays and pacing patterns to avoid triggering LinkedIn's bot detection
- **Email account ramp-up**: gradually increase sending volume on new email accounts to build sender reputation safely
- **Multiple accounts**: connect as many SMTP/IMAP email accounts and LinkedIn accounts as you need, each with its own daily limits
- **Daily limits & auto-reschedule**: set max connections and messages per day; when a limit is hit the runner reschedules work for the next day automatically instead of stopping the campaign

### 📊 Analytics

- **Campaign pipeline view**: funnel breakdown by step with prospect counts per stage; click any step to drill into the exact contacts at that point
- **Stats bar**: live counts for total prospects, in progress, completed, failed/skipped, connections sent, accepted, and messages sent
- **Acceptance rate**: tracks connection request → acceptance ratio per campaign
- **Dashboard overview**: cross-campaign summary of active runs, total contacts, recent activity

---

## Hosting Options

### Self-Host with Docker

**1. Create your environment file**

```bash
cp .env.example .env.local
```
Start the container:

```Bash
docker compose up -d
```
Or run directly:

```Bash
docker run -d -p 3000:3000 \
  -e NEXTAUTH_URL=http://localhost:3000 \
  -e NEXTAUTH_SECRET=your_random_secret_here \
  -e SUPERADMIN_EMAILS="example@email.com" \ # put your email here
  -v $(pwd)/outbount.db:/app/outbount.db \
  outbount:latest
```
Outbount is now running at http://localhost:3000. The SQLite database is persisted in ./outbount.db on your host machine.

Security Note: Public signups are disabled by default. Only email addresses declared in SUPERADMIN_EMAILS can perform initial registration. All other team members must be invited via secure invitation links generated under Platform → Workspace & API.

Self-Host Manually (Node.js)
Requires Node.js 22+.

```Bash
npm install
npm run build
npm start
```

Setup Guide
1. Initial Admin Registration
Ensure your email is listed under SUPERADMIN_EMAILS in .env.local, then navigate to /signup to register your primary workspace account.

2. Add a LinkedIn Account
Go to Settings → LinkedIn and add your account. Set conservative daily limits to start (recommended: 20 connections/day, 30 messages/day).

3. Authenticate LinkedIn
Click Authenticate and select Server login — Outbount logs in on the server and walks you through LinkedIn's verification (email/SMS code or a tap in the LinkedIn mobile app). This captures a full, long-lived session, including the Sales Navigator seat needed for imports.

4. Add Email Accounts (Optional)
Go to Settings → Email and add your SMTP/IMAP accounts. You can add as many as you need. Enable ramp-up on new accounts to build sender reputation gradually.

5. Connect Apollo (Optional)
Go to Settings → Integrations and add your Apollo API key. Once connected, open any lead list and click Enrich to pull in verified emails and company data.

6. Import a Lead List
Go to Lists → New list and paste a LinkedIn Sales Navigator list URL or upload a CSV. Outbount imports all leads with human-like pacing to avoid detection.

7. Build and Launch a Campaign
Go to Workflows → New workflow. Add your steps — LinkedIn actions, email steps, delays — write your messages (or use templates and A/B pools), create a run, and launch.

API & Integration Services

Public API
Create a scoped key in Platform → Workspace & API, then send it as a bearer token:

```Bash
curl -H "Authorization: Bearer lnk_…" \
  http://localhost:3000/api/v1/contacts
```
Resources include contacts, companies, lists, workflows, runs, events, signals, and opportunities.

MCP Server
Connect an MCP client to https://your-outbount-host/api/mcp. Authorization discovery, OAuth client registration, PKCE authorization, refresh tokens, and resource binding are exposed automatically.

Every authenticated workspace operation is MCP-usable. Dedicated tools cover contacts, companies, custom fields, lists/imports, templates, conditional workflows, campaign runs, senders, reply intelligence, deliverability, CRM/calendar sync, and workspace management.

Team Invitations
Open Platform → Workspace & API, enter a teammate's email, and select a role. Outbount creates a single-use link that expires after seven days. Invited users use this link to create their account and automatically join your workspace.

License
Outbount is source-available under the Outbount Sustainable Use License.
