import Head from "next/head";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

type Tab = "overview" | "deliverability" | "automation" | "integrations" | "admin";
type Data = Record<string, unknown>;

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "deliverability", label: "Deliverability" },
  { id: "automation", label: "Automation & signals" },
  { id: "integrations", label: "CRM & calendar" },
  { id: "admin", label: "Workspace & API" },
];

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body;
}

export default function PlatformPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, Data>>({});
  const [revealedKey, setRevealedKey] = useState("");
  const [revealedInvite, setRevealedInvite] = useState("");
  const { update: updateSession } = useSession();

  const refresh = useCallback(async () => {
    setLoading(true);
    const endpoints: Record<string, string> = {
      workspace: "/api/platform/workspace",
      suppressions: "/api/platform/suppressions",
      deliverability: "/api/platform/deliverability",
      webhooks: "/api/platform/webhooks",
      signals: "/api/platform/signals",
      rules: "/api/platform/signal-rules",
      pipeline: "/api/platform/pipeline",
      connections: "/api/platform/connections",
      inbox: "/api/platform/inbox",
      apiKeys: "/api/platform/api-keys",
      audit: "/api/platform/audit",
      invitations: "/api/platform/invitations",
    };
    const results = await Promise.all(
      Object.entries(endpoints).map(async ([key, url]) => {
        try { return [key, await api(url)] as const; }
        catch (error) { return [key, { error: error instanceof Error ? error.message : String(error) }] as const; }
      })
    );
    setData(Object.fromEntries(results));
    setLoading(false);
  }, []);

  useEffect(() => { const t = setTimeout(() => void refresh(), 0); return () => clearTimeout(t); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>, url: string, body: (form: FormData) => unknown, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(new FormData(form))) });
      if (result?.key) setRevealedKey(result.key);
      if (result?.invite_url) setRevealedInvite(result.invite_url);
      form.reset();
      toast.success(success);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  }

  const workspace = data.workspace as { workspace?: { id?: string; name?: string }; workspaces?: unknown[]; current_role?: string; members?: unknown[] } | undefined;
  const pipeline = data.pipeline as { stages?: unknown[]; opportunities?: unknown[]; meetings?: unknown[]; revenue?: Record<string, number> } | undefined;
  const inbox = data.inbox as { stats?: Record<string, number>; members?: unknown[]; tags?: unknown[]; saved_replies?: unknown[] } | undefined;
  const invitations = data.invitations as { invitations?: unknown[] } | undefined;
  const stats = useMemo(() => [
    ["Open replies", inbox?.stats?.open ?? 0],
    ["SLA overdue", inbox?.stats?.overdue ?? 0],
    ["Active signals", arr(data.signals).length],
    ["Open pipeline", money(pipeline?.revenue?.open_pipeline)],
    ["Won revenue", money(pipeline?.revenue?.won_revenue)],
    ["Meetings", pipeline?.meetings?.length ?? 0],
  ], [data.signals, inbox, pipeline]);

  return <>
    <Head><title>Platform — Outbount</title></Head>
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            {workspace?.workspace?.name ?? "Workspace"} · {workspace?.current_role ?? "member"}
          </p>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-.03em] text-neutral-900 dark:text-neutral-100">Revenue platform</h1>
          <p className="mt-2 text-[15px] text-neutral-500 dark:text-neutral-400">Deliverability, signals, pipeline, and workspace controls.</p>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800 scrollbar-none">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === item.id
              ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
              : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
                <div className="text-[13px] text-neutral-500 dark:text-neutral-400">{label}</div>
                <div className="mt-1.5 text-2xl font-semibold tracking-[-.03em] tabular-nums text-neutral-900 dark:text-neutral-100">{value}</div>
              </div>
            ))}
          </div>
          <Section title="Pipeline stages"><Table rows={arr(pipeline?.stages)} columns={["name", "opportunity_count", "amount", "weighted_amount"]} /></Section>
          <Section title="Recent meetings"><Table rows={arr(pipeline?.meetings).slice(0, 8)} columns={["title", "contact_name", "starts_at", "provider", "status"]} /></Section>
        </div>
      )}

      {/* ── Deliverability ── */}
      {tab === "deliverability" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Section title="Domain authentication" subtitle="Live SPF, DKIM, DMARC and MX diagnostics with sender-health scoring.">
            <Form onSubmit={(e) => submit(e, "/api/platform/deliverability", (f) => ({ action: "check_domain", domain: f.get("domain"), selector: f.get("selector") || "default" }), "Domain checked")}>
              <Input name="domain" placeholder="example.com" required /><Input name="selector" placeholder="DKIM selector (default)" /><Submit>Run checks</Submit>
            </Form>
            <Table rows={arr((data.deliverability as Data)?.latest_checks)} columns={["domain", "score", "spf_status", "dkim_status", "dmarc_status", "mx_status"]} />
          </Section>
          <Section title="Inbox placement test" subtitle="Send an authorized seed message, then record where it landed.">
            <Form onSubmit={(e) => submit(e, "/api/platform/deliverability", (f) => ({ action: "placement_test", email_account_id: f.get("email_account_id"), seed_email: f.get("seed_email") }), "Placement test sent")}>
              <Input name="email_account_id" placeholder="Email account ID" required /><Input name="seed_email" type="email" placeholder="Seed mailbox" required /><Submit>Send test</Submit>
            </Form>
            <Table rows={arr((data.deliverability as Data)?.placement_tests)} columns={["seed_email", "status", "placement", "sent_at"]} />
          </Section>
          <Section title="Mailbox warmup" subtitle="Reciprocal sending between your configured mailboxes with gradual daily targets.">
            <Table rows={arr((data.deliverability as Data)?.warmup)} columns={["name", "from_email", "enabled", "daily_target", "sent_today"]} />
          </Section>
          <Section title="Global do-not-contact" subtitle="Checked before every automated or manual email send.">
            <Form onSubmit={(e) => submit(e, "/api/platform/suppressions", (f) => ({ kind: f.get("kind"), value: f.get("value"), reason: f.get("reason") || "manual" }), "Suppression added")}>
              <Select name="kind" options={["email", "domain", "phone", "company"]} /><Input name="value" placeholder="email / domain / phone / company" required /><Input name="reason" placeholder="Reason (opt)" /><Submit>Add suppression</Submit>
            </Form>
            <Table rows={arr(data.suppressions)} columns={["kind", "value", "reason", "created_at"]} />
          </Section>
        </div>
      )}

      {/* ── Automation & signals ── */}
      {tab === "automation" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Section title="Signal rules" subtitle="Rules map incoming buyer signals to targets and campaigns.">
            <Form onSubmit={(e) => submit(e, "/api/platform/signal-rules", (f) => ({ name: f.get("name"), signal_type: f.get("signal_type"), min_score: Number(f.get("min_score") || 50), auto_start: f.get("auto_start") === "true" }), "Signal rule created")}>
              <Input name="name" placeholder="Rule name" required />
              <Input name="signal_type" placeholder="signal_type (e.g. job_change)" required />
              <Input name="min_score" type="number" placeholder="Min score (default 50)" />
              <Select name="auto_start" options={["false", "true"]} />
              <Submit>Create rule</Submit>
            </Form>
            <RulesTable rows={arr(data.rules)} />
          </Section>

          <Section title="Ingest prospect signal" subtitle="Manually push a buyer signal into the workflow engine.">
            <Form onSubmit={(e) => submit(e, "/api/platform/signals", (f) => ({ type: f.get("type"), title: f.get("title"), target_id: f.get("target_id") || undefined, score: Number(f.get("score") || 0) }), "Signal ingested")}>
              <Select name="type" options={["job_change", "funding", "hiring", "technology", "product_intent", "custom"]} />
              <Input name="title" placeholder="Signal title" required />
              <Input name="target_id" placeholder="Contact ID (optional)" />
              <Input name="score" type="number" placeholder="Score (0–100, default 0)" />
              <Submit>Ingest signal</Submit>
            </Form>
            <Table rows={arr(data.signals).slice(0, 50)} columns={["signal_type", "score", "target_email", "company_domain", "created_at"]} />
          </Section>

          <Section title="Conditional workflows" subtitle="Signal rules trigger enrollment into sequences when buyer intent is detected.">
            <div className="space-y-3">
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">How signal rules work</div>
                <ul className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1 list-disc list-inside">
                  <li>A signal arrives via webhook, public API, or manual ingest</li>
                  <li>Matching rules enroll the contact into a linked campaign</li>
                  <li>Auto-start rules begin outreach immediately; manual rules queue for review</li>
                  <li>Min-score threshold filters weak or irrelevant signals</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Mini label="Active rules" value={arr(data.rules).filter((r) => !!(r as Data).enabled).length} />
                <Mini label="Total signals" value={arr(data.signals).length} />
              </div>
            </div>
          </Section>

          <Section title="Reply intelligence" subtitle="Automatic classification of inbound replies to route, prioritise, and action.">
            <div className="space-y-3">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Every inbound reply is classified into one of the categories below. Positive and human-review replies surface in the team inbox.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Positive", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
                  { label: "Negative", color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
                  { label: "Out of office", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                  { label: "Unsubscribe", color: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600" },
                  { label: "Human review", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
                ].map(({ label, color }) => (
                  <span key={label} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${color}`}>
                    {label}
                  </span>
                ))}
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3">
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Unsubscribe replies auto-suppress the contact. Out-of-office replies pause the sequence and re-queue after the detected return date.
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ── CRM & calendar ── */}
      {tab === "integrations" && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Section title="Connect CRM or calendar" subtitle="Link Salesforce, HubSpot, Outlook, or Google Workspace for two-way sync.">
            <Form
              autoComplete="off"
              onSubmit={(e) => submit(e, "/api/platform/connections", (f) => ({
                provider: f.get("provider"),
                name: f.get("connection_name"),
                secret: f.get("connection_secret") || undefined,
                config: f.get("config") ? (() => { try { return JSON.parse(String(f.get("config"))); } catch { return {}; } })() : {},
              }), "Connection added")}
            >
              <Select name="provider" options={["hubspot", "salesforce", "ical", "google_calendar", "microsoft_calendar"]} />
              <Input name="connection_name" placeholder="Connection name" required autoComplete="off" />
              <Input name="connection_secret" type="password" placeholder="Access token / private app token" autoComplete="new-password" />
              <input
                name="config"
                placeholder='Extra config JSON (optional, e.g. {"instance_url":"…"})'
                className="h-9 px-3 rounded-lg text-sm border w-full outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-neutral-100/20 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
              />
              <Submit>Add connection</Submit>
            </Form>
          </Section>

          <Section title="CRM & calendar sync" subtitle="Two-way sync status for Salesforce, HubSpot, Outlook, and Google Workspace.">
            <Connections rows={arr(data.connections)} refresh={refresh} />
          </Section>

          <Section title="Create opportunity" subtitle="Manually open a deal in the pipeline for a contact or company.">
            <Form onSubmit={(e) => submit(e, "/api/platform/pipeline", (f) => ({
              name: f.get("name"),
              target_id: f.get("target_id") || undefined,
              stage_id: f.get("stage_id") || undefined,
              amount: f.get("amount") ? Number(f.get("amount")) : undefined,
              currency: f.get("currency") || "USD",
            }), "Opportunity created")}>
              <Input name="name" placeholder="Deal name" required />
              <Input name="target_id" placeholder="Contact ID (optional)" />
              <Input name="stage_id" placeholder="Pipeline stage ID (optional)" />
              <Input name="amount" type="number" placeholder="Amount (USD)" />
              <Submit>Create opportunity</Submit>
            </Form>
          </Section>

          <Section title="Opportunities" subtitle="Open and closed deals tracked in the pipeline.">
            <Table rows={arr(pipeline?.opportunities).slice(0, 25)} columns={["name", "stage_name", "contact_name", "company_name", "amount", "expected_close_date"]} />
          </Section>
        </div>
      )}

      {/* ── Workspace & API ── */}
      {tab === "admin" && (
        <div className="grid lg:grid-cols-2 gap-5 pb-20">

          {/* 👈 LEFT COLUMN */}
          <div className="space-y-5">
            {/* Workspace members */}
            <Section title="Workspace members" subtitle="Invite collaborators to share outreach, assign work, manage campaigns, and review replies.">
              <Form onSubmit={(e) => submit(e, "/api/platform/invitations", (f) => ({ email: f.get("email"), role: f.get("role") }), "Invitation sent")}>
                <Input name="email" type="email" placeholder="Teammate@example.com" required />
                <Select name="role" options={["owner", "admin", "manager", "member", "viewer"]} />
                <Submit>Invite teammate</Submit>
              </Form>
              {revealedInvite && (
                <div className="mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">Invite link generated</div>
                  <code className="text-xs break-all select-all text-neutral-900 dark:text-neutral-100">{revealedInvite}</code>
                </div>
              )}
              <Members rows={arr(workspace?.members)} currentRole={workspace?.current_role} refresh={refresh} />
              <p className="mt-4 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Pending invitations</p>
              <Invitations rows={arr(invitations?.invitations)} refresh={refresh} />
            </Section>

            {/* Team inbox */}
            <Section title="Team inbox" subtitle="Tags, saved replies, assignment, collision locks, bulk status, SLA and sentiment filters are enabled.">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Mini label="Members" value={arr(workspace?.members).length} />
                <Mini label="Tags" value={arr(inbox?.tags).length} />
                <Mini label="Saved replies" value={arr(inbox?.saved_replies).length} />
                <Mini label="Unassigned" value={inbox?.stats?.unassigned ?? 0} />
              </div>
              <Form onSubmit={(e) => submit(e, "/api/platform/inbox", (f) => ({ action: "create_saved_reply", name: f.get("name"), body: f.get("body") }), "Saved reply created")}>
                <Input name="name" placeholder="Saved reply name" />
                <textarea name="body" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 resize-y min-h-[80px]" placeholder="Reply text" />
                <Submit>Save reply</Submit>
              </Form>
            </Section>

            {/* Signed webhooks */}
            <Section title="Signed webhooks" subtitle="HMAC-SHA256 deliveries retry with exponential backoff and move to a dead-letter state after eight attempts.">
              <Form onSubmit={(e) => submit(e, "/api/platform/webhooks", (f) => ({ url: f.get("url"), event_types: String(f.get("event_types") || "*") }), "Webhook created")}>
                <Input name="url" type="url" placeholder="https://…" required />
                <Input name="event_types" defaultValue="*" />
                <Submit>Add endpoint</Submit>
              </Form>
              <Table rows={arr(data.webhooks)} columns={["url", "event_types", "enabled", "delivery_count", "dead_letters"]} />
            </Section>
          </div>

          {/* 👉 RIGHT COLUMN */}
          <div className="space-y-5">
            {/* Your workspaces */}
            <Section title="Your workspaces" subtitle="Switch between outreach workspaces you own or have joined.">
              <WorkspacePicker
                rows={arr(workspace?.workspaces)}
                active={String(workspace?.workspace?.id ?? "")}
                onSwitch={async (id) => {
                  await api("/api/platform/workspace", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: id }) });
                  await updateSession({ workspaceId: id });
                  toast.success("Switched workspace");
                  await refresh();
                }}
              />
            </Section>

            {/* Public API keys */}
            <Section title="Public API keys" subtitle="The secret is shown once and stored only as a hash.">
              <Form onSubmit={(e) => submit(e, "/api/platform/api-keys", (f) => ({ name: f.get("name"), scopes: String(f.get("scopes") || "").split(",").map((x) => x.trim()).filter(Boolean) }), "API key created")}>
                <Input name="name" placeholder="Key name" required />
                <Input name="scopes" defaultValue="contacts:read,contacts:write,campaigns:read,events:read" />
                <Submit>Create key</Submit>
              </Form>
              {revealedKey && (
                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                  <div className="text-xs text-amber-600 dark:text-amber-400 mb-1">Copy now — it will not be shown again</div>
                  <code className="text-xs break-all select-all text-neutral-900 dark:text-neutral-100">{revealedKey}</code>
                </div>
              )}
              <Table rows={arr(data.apiKeys)} columns={["name", "key_prefix", "scopes", "last_used_at", "created_at"]} />
            </Section>

            {/* Right: Audit log */}
            <Section title="Audit log">
              {/* Added max-h-80 and overflow-y-auto so the table scrolls internally */}
              <div className="max-h-80 overflow-y-auto pr-1">
                <Table
                  rows={arr(data.audit).slice(0, 50)}
                  columns={["action", "entity_type", "user_email", "ip_address", "created_at"]}
                />
              </div>
            </Section>
          </div>

        </div>
      )}
    </div>
  </>;
}

/* ── Shared UI components ───────────────────────────────────────────────────── */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <div className="mb-4 space-y-1">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        {subtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Form(props: React.FormHTMLAttributes<HTMLFormElement>) {
  const { children, className, ...rest } = props;
  return <form {...rest} className={`mb-4 space-y-3.5 ${className ?? ""}`}>{children}</form>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-9 px-3 rounded-lg text-sm border w-full outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-neutral-100/20 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 ${props.className ?? ""}`}
    />
  );
}

function Select({ name, options }: { name: string; options: string[] }) {
  return (
    <select
      name={name}
      className="h-9 px-3 rounded-lg text-sm border w-full outline-none bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100"
    >
      {options.map((x) => (
        <option key={x} value={x} className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
          {x.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="mt-2 inline-flex items-center justify-center h-9 px-4 rounded-lg text-sm font-semibold transition-colors justify-self-start bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 border border-neutral-900 dark:border-white"
      type="submit"
    >
      {children}
    </button>
  );
}

function Mini({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3">
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{String(value)}</div>
    </div>
  );
}

function Table({ rows, columns }: { rows: unknown[]; columns: string[] }) {
  if (!rows.length) return <p className="py-3 text-sm text-neutral-500">No records yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            {columns.map((x) => (
              <th key={x} className="text-neutral-500 dark:text-neutral-400 font-semibold py-2 px-3 uppercase tracking-wide text-[10px]">
                {x.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, i) => (
            <tr key={String((row as Data).id ?? i)} className="border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
              {columns.map((c) => (
                <td key={c} className="max-w-52 truncate py-2 px-3 text-neutral-900 dark:text-neutral-100">{display((row as Data)[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesTable({ rows }: { rows: unknown[] }) {
  if (!rows.length) return <p className="py-4 text-xs text-neutral-400 dark:text-neutral-500">No signal rules yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            {["name", "signal", "min score", "list", "campaign", "status"].map((x) => (
              <th key={x} className="text-neutral-500 dark:text-neutral-400 font-semibold py-2 px-3 uppercase tracking-wide text-[10px]">{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, i) => {
            const r = row as Data;
            const enabled = !!r.enabled;
            const auto = !!r.auto_start;
            return (
              <tr key={String(r.id ?? i)} className="border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                <td className="max-w-52 truncate py-2 px-3 text-neutral-900 dark:text-neutral-100">{display(r.name)}</td>
                <td className="max-w-52 truncate py-2 px-3 text-neutral-700 dark:text-neutral-200">{display(r.signal_type)}</td>
                <td className="py-2 px-3 text-neutral-900 dark:text-neutral-100">{display(r.min_score)}</td>
                <td className="max-w-52 truncate py-2 px-3 text-neutral-700 dark:text-neutral-200">{display(r.list_name)}</td>
                <td className="max-w-52 truncate py-2 px-3 text-neutral-700 dark:text-neutral-200">{display(r.workflow_name)}</td>
                <td className="py-2 px-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"}`}>
                      {enabled && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                      {enabled ? "Live" : "Off"}
                    </span>
                    {enabled && auto && (
                      <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">auto-start</span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Connections({ rows, refresh }: { rows: unknown[]; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  async function sync(id: string) {
    setBusy(id);
    try {
      await api("/api/platform/connections", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      toast.success("Sync complete");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }
  if (!rows.length) return <p className="py-3 text-sm text-neutral-500">No CRM connections yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const x = r as Data;
        return (
          <div key={String(x.id ?? i)} className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{String(x.name)}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {String(x.provider)} · {x.sync_error ? String(x.sync_error) : x.last_synced_at ? `synced ${String(x.last_synced_at)}` : "never synced"}
              </div>
            </div>
            <button
              className="h-7 px-3 rounded-md text-xs font-medium bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              onClick={() => void sync(String(x.id))}
              disabled={busy === x.id}
            >
              {busy === x.id ? "Syncing…" : "Sync now"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const MEMBER_ROLES = ["owner", "admin", "manager", "member", "viewer"];

function Members({ rows, currentRole, refresh }: { rows: unknown[]; currentRole?: string; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const canManage = currentRole === "owner" || currentRole === "admin";

  async function changeRole(email: string, role: string) {
    setBusy(email);
    try {
      await api("/api/platform/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
      toast.success("Role updated");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Remove ${email} from this workspace? They lose all access.`)) return;
    setBusy(id);
    try {
      await api(`/api/platform/workspace?user_id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Member removed");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  if (!rows.length) return <p className="py-2 text-xs text-neutral-400 dark:text-neutral-500">No members yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const x = row as Data;
        const id = String(x.id ?? "");
        const email = String(x.email ?? "");
        const role = String(x.role ?? "member");
        return (
          <div key={id || i} className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">{email}</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">joined {String(x.created_at ?? "").slice(0, 10)}</div>
            </div>
            {canManage ? (
              <select
                disabled={busy === email}
                value={role}
                onChange={(e) => void changeRole(email, e.target.value)}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1 text-xs text-neutral-900 dark:text-neutral-100"
              >
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r} disabled={r === "owner" && currentRole !== "owner"} className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">{r}</option>
                ))}
              </select>
            ) : (
              <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs capitalize text-neutral-700 dark:text-neutral-300">{role}</span>
            )}
            {canManage && (
              <button type="button" disabled={busy === id} onClick={() => void remove(id, email)} className="h-7 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline">
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Invitations({ rows, refresh }: { rows: unknown[]; refresh: () => Promise<void> }) {
  async function revoke(id: string) {
    try {
      await api(`/api/platform/invitations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Invitation revoked");
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }
  if (!rows.length) return <p className="py-2 text-xs text-neutral-400 dark:text-neutral-500">No invitations yet.</p>;
  return (
    <div className="space-y-2">
      {rows.slice(0, 20).map((row, i) => {
        const x = row as Data;
        return (
          <div key={String(x.id ?? i)} className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">{String(x.email)}</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{String(x.role)} · {String(x.status)}</div>
            </div>
            {x.status === "pending" && (
              <button type="button" className="h-7 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline" onClick={() => void revoke(String(x.id))}>
                Revoke
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WorkspacePicker({ rows, active, onSwitch }: { rows: unknown[]; active: string; onSwitch: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState("");
  if (!rows.length) return <p className="py-2 text-xs text-neutral-400 dark:text-neutral-500">No workspaces found.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const x = row as Data;
        const id = String(x.id ?? "");
        const isCurrent = id === active;
        return (
          <button
            type="button"
            key={id || i}
            disabled={isCurrent || busy !== ""}
            onClick={async () => {
              setBusy(id);
              try { await onSwitch(id); }
              catch (e) { toast.error(e instanceof Error ? e.message : String(e)); setBusy(""); }
            }}
            className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${isCurrent
              ? "border-neutral-400 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800"
              : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              }`}
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{String(x.name)}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{String(x.role)}</div>
            </div>
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {isCurrent ? "Current" : busy === id ? "Switching…" : "Switch"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function money(value: unknown) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value ?? 0)); }
function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
