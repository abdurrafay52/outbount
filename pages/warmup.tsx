import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RiFireLine, RiAddLine, RiPlayCircleLine, RiPauseLine, RiDeleteBinLine,
  RiArrowLeftLine, RiArrowRightLine, RiCheckLine, RiMailLine, RiGroupLine,
  RiTimeLine, RiRobot2Line, RiShieldLine, RiSettings4Line, RiAlertLine,
  RiInboxLine, RiRefreshLine, RiLoader4Line,
} from "react-icons/ri";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailAccount { id: string; name: string; from_email: string; }
interface CustomAiProvider {
  id: string;
  name: string;
  base_url: string;
  default_model: string | null;
  models: AiModel[];
  provider_type: string;
  updated_at: string;
}
interface AiIntegration { key: string; updated_at: string; }
interface AiConfig { base_url: string | null; default_model: string | null; }
interface Campaign {
  id: string; name: string; description: string | null; status: string;
  target_count: number; peer_count: number; created_at: string;
  timezone: string; max_daily_target: number; ai_enabled: number;
  ai_provider_key?: string | null; ai_model?: string | null;
  paused_reason: string | null;
}
interface AiModel { id: string; name: string; }

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney",
];

const STEPS = [
  { id: 1, label: "Target Inboxes", icon: RiInboxLine },
  { id: 2, label: "Peer Pool",      icon: RiGroupLine },
  { id: 3, label: "Schedule",       icon: RiTimeLine },
  { id: 4, label: "AI Content",     icon: RiRobot2Line },
  { id: 5, label: "Safety",         icon: RiShieldLine },
  { id: 6, label: "Review",         icon: RiCheckLine },
];

const BLANK_FORM = {
  name: "", description: "",
  target_inbox_ids: [] as string[],
  peer_inbox_ids: [] as string[],
  timezone: "UTC", active_hours_start: 9, active_hours_end: 18,
  send_jitter_min: 5, send_jitter_max: 25,
  ramp_type: "linear", start_volume: 2, ramp_increment: 2, max_daily_target: 30,
  custom_ramp_caps: "",
  reply_rate: 45,
  ai_enabled: true,
  ai_provider_key: "" as string,
  ai_model: "",
  ai_base_url: "",
  ai_system_prompt: `You are an expert email warmup assistant. Write natural, human-like warmup emails that simulate genuine business communication between professionals.`,
  ai_user_prompt: `Write a short, professional warmup email on the topic below. Keep it to 2–3 sentences. Don't use templates or placeholders.\nTopic: {{topic}}`,
  ai_examples: `Example 1:\nSubject: Quick check-in\nHey Sarah, just wanted to touch base on the project timeline. Let me know if you need anything from my side — happy to jump on a call this week.\n\nExample 2:\nSubject: Following up\nHi James, hope your week is going well. I wanted to circle back on our last conversation about the Q4 targets — do you have 15 minutes Thursday?`,
  circuit_breaker_bounce_pct: 2,
  circuit_breaker_spam_pct: 5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    paused: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    archived: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.archived}`}>
      {status}
    </span>
  );
}

function InboxSelector({
  accounts, selected, onChange, exclude = [],
}: {
  accounts: EmailAccount[]; selected: string[]; onChange: (v: string[]) => void; exclude?: string[];
}) {
  const available = accounts.filter(a => !exclude.includes(a.id));
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {available.length === 0 && (
        <p className="text-sm text-neutral-400 py-4 text-center">No available email accounts.</p>
      )}
      {available.map(a => {
        const checked = selected.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => toggle(a.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
              checked
                ? "border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5"
                : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600"
            }`}
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
              checked ? "bg-neutral-900 dark:bg-white border-neutral-900 dark:border-white" : "border-neutral-300 dark:border-neutral-600"
            }`}>
              {checked && <RiCheckLine size={10} className="text-white dark:text-neutral-900" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{a.name}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{a.from_email}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WarmupPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [customAiProviders, setCustomAiProviders] = useState<CustomAiProvider[]>([]);
  const [aiIntegrations, setAiIntegrations] = useState<AiIntegration[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/warmup/campaigns");
      if (!r.ok) throw new Error();
      const d = await r.json() as {
        campaigns: Campaign[];
        emailAccounts: EmailAccount[];
        customAiProviders: CustomAiProvider[];
        aiIntegrations: AiIntegration[];
        aiConfig: AiConfig;
      };
      setCampaigns(d.campaigns ?? []);
      setEmailAccounts(d.emailAccounts ?? []);
      setCustomAiProviders(d.customAiProviders ?? []);
      setAiIntegrations(d.aiIntegrations ?? []);
      setAiConfig(d.aiConfig ?? null);
    } catch { toast.error("Failed to load warmup data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function updateStatus(id: string, status: string) {
    try {
      await fetch("/api/warmup/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", campaign_id: id, status }),
      });
      toast.success(`Campaign ${status}`);
      void refresh();
    } catch { toast.error("Failed to update campaign"); }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this warmup campaign? This cannot be undone.")) return;
    try {
      await fetch("/api/warmup/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_campaign", campaign_id: id }),
      });
      toast.success("Campaign deleted");
      void refresh();
    } catch { toast.error("Failed to delete campaign"); }
  }

  return (
    <>
      <Head>
        <title>Warmup Campaigns — Outbount</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">Deliverability</p>
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-neutral-900 dark:text-neutral-100">
              Warmup Campaigns
            </h1>
            <p className="mt-2 text-[15px] text-neutral-500 dark:text-neutral-400">
              Campaign-style inbox warmup with full control over pools, scheduling, and AI content.
            </p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            <RiAddLine size={16} /> New Campaign
          </button>
        </div>

        {/* Campaign list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RiLoader4Line size={24} className="animate-spin text-neutral-400" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl">
            <RiFireLine size={40} className="text-neutral-300 dark:text-neutral-600" />
            <div className="text-center">
              <p className="font-semibold text-neutral-700 dark:text-neutral-300">No warmup campaigns yet</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Create your first campaign to start warming up inboxes.</p>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors mt-2"
            >
              <RiAddLine size={16} /> New Campaign
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(c => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge status={c.status} />
                    {c.paused_reason && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <RiAlertLine size={12} /> Auto-paused
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">{c.name}</p>
                  {c.paused_reason && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{c.paused_reason}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{c.target_count}</span> target inbox{c.target_count !== 1 ? "es" : ""}
                    </span>
                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{c.peer_count}</span> peer{c.peer_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      up to <span className="font-medium text-neutral-700 dark:text-neutral-300">{c.max_daily_target}</span>/day
                    </span>
                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{c.timezone}</span>
                    {c.ai_enabled ? (
                      <>
                        <span className="text-neutral-300 dark:text-neutral-700">·</span>
                        <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                          AI on {c.ai_model ? `(${c.ai_model})` : ""}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateStatus(c.id, c.status === "active" ? "paused" : "active")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {c.status === "active" ? <><RiPauseLine size={13} /> Pause</> : <><RiPlayCircleLine size={13} /> Resume</>}
                  </button>
                  <button
                    onClick={() => deleteCampaign(c.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 dark:border-red-900/50 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <RiDeleteBinLine size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wizard */}
      {showWizard && (
        <WarmupWizard
          emailAccounts={emailAccounts}
          customAiProviders={customAiProviders}
          aiIntegrations={aiIntegrations}
          aiConfig={aiConfig}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); void refresh(); }}
        />
      )}
    </>
  );
}

// ─── Multi-step Wizard ────────────────────────────────────────────────────────

function WarmupWizard({
  emailAccounts, customAiProviders, aiIntegrations, aiConfig, onClose, onCreated,
}: {
  emailAccounts: EmailAccount[];
  customAiProviders: CustomAiProvider[];
  aiIntegrations: AiIntegration[];
  aiConfig: AiConfig | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<AiModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const set = <K extends keyof typeof BLANK_FORM>(k: K, v: typeof BLANK_FORM[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  // Build provider options: custom providers + saved integrations + workspace AI config
  const providerOptions: { key: string; label: string; default_model?: string | null; models?: AiModel[] }[] = [
    { key: "", label: "Select a provider…" },
  ];

  // 1. All configured custom AI providers
  for (const cp of customAiProviders) {
    providerOptions.push({
      key: cp.id,
      label: `${cp.name} (${cp.base_url})`,
      default_model: cp.default_model,
      models: cp.models,
    });
  }

  // 2. Saved integrations (OpenRouter, etc.)
  const seen = new Set<string>();
  for (const i of aiIntegrations) {
    const base = i.key.split("_")[0];
    if (!seen.has(base)) {
      seen.add(base);
      const label = base === "openrouter" ? "OpenRouter (Saved Integration)" :
        base === "openai" ? "OpenAI (Saved Integration)" : `${base} (Saved Integration)`;
      providerOptions.push({ key: i.key, label });
    }
  }

  // 3. Workspace base url
  if (aiConfig?.base_url) {
    providerOptions.push({ key: "__workspace_ai__", label: `Workspace Override (${aiConfig.base_url})` });
  }
  providerOptions.push({ key: "__custom__", label: "Enter custom endpoint & key manually" });

  async function fetchModels(providerKey: string) {
    if (!providerKey || providerKey === "") return;
    setFetchingModels(true);
    try {
      const r = await fetch("/api/warmup/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch_models",
          provider_key: providerKey,
          base_url: providerKey === "__workspace_ai__" ? aiConfig?.base_url : form.ai_base_url,
        }),
      });
      const d = await r.json() as { models: AiModel[] };
      setModels(d.models ?? []);
      if (d.models?.length) set("ai_model", d.models[0].id);
    } catch { toast.error("Could not fetch models"); }
    finally { setFetchingModels(false); }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        action: "create_campaign",
        custom_ramp_caps: form.ramp_type === "custom" && form.custom_ramp_caps
          ? form.custom_ramp_caps.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
          : null,
        ai_enabled: form.ai_enabled,
        ai_provider_key: form.ai_provider_key || null,
      };
      const r = await fetch("/api/warmup/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) { toast.error(d.error || "Failed to create campaign"); return; }
      toast.success("Warmup campaign created!");
      onCreated();
    } catch { toast.error("Error creating campaign"); }
    finally { setSaving(false); }
  }

  const inputCls = "w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 px-4 py-2.5 text-sm text-neutral-900 dark:text-white focus:border-neutral-400 dark:focus:border-neutral-600 focus:outline-none transition-colors";
  const labelCls = "block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5";

  const canNext = (() => {
    if (step === 1) return form.target_inbox_ids.length > 0 && form.name.trim().length > 0;
    if (step === 4) return !form.ai_enabled || (!!form.ai_provider_key);
    return true;
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-auto bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[90vh]">

        {/* Wizard Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <RiFireLine size={18} className="text-neutral-500" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">New Warmup Campaign</h2>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs">Cancel</button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2 overflow-x-auto shrink-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => done && setStep(s.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    active ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900" :
                    done ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700" :
                    "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-default"
                  }`}
                >
                  {done ? <RiCheckLine size={12} /> : <Icon size={12} />}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-neutral-200 dark:bg-neutral-700 shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Step body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 1: Name + Target Inboxes ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Campaign Details & Target Inboxes</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Name this campaign and choose which email accounts should be warmed up.</p>
              </div>
              <div>
                <label className={labelCls}>Campaign Name *</label>
                <input className={inputCls} placeholder="e.g. Q4 Outbound Warmup" value={form.name} onChange={e => set("name", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Description (optional)</label>
                <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Short description…" value={form.description} onChange={e => set("description", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Target Inboxes to Warm Up *</label>
                <p className="text-xs text-neutral-400 mb-2">These are the inboxes whose reputation you want to build.</p>
                <InboxSelector accounts={emailAccounts} selected={form.target_inbox_ids} onChange={v => set("target_inbox_ids", v)} />
              </div>
            </div>
          )}

          {/* ── Step 2: Peer Pool ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Peer Pool</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  Select which inboxes will <em>receive and reply to</em> warmup emails. If none are selected, the platform uses the global shared warmup pool.
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3.5 text-xs text-neutral-600 dark:text-neutral-400">
                <strong>Tip:</strong> Using dedicated peer inboxes isolates your warmup traffic from the global pool — ideal for enterprise environments.
              </div>
              <div>
                <label className={labelCls}>Peer Inboxes (optional — leave empty for global pool)</label>
                <InboxSelector
                  accounts={emailAccounts}
                  selected={form.peer_inbox_ids}
                  onChange={v => set("peer_inbox_ids", v)}
                  exclude={form.target_inbox_ids}
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Schedule & Volume ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Schedule & Volume</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Define when warmup emails are sent and how volume ramps up.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Timezone</label>
                  <select className={inputCls} value={form.timezone} onChange={e => set("timezone", e.target.value)}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Reply Rate (%)</label>
                  <input type="number" className={inputCls} min={0} max={100} value={form.reply_rate} onChange={e => set("reply_rate", Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Active Hours Start (0–23)</label>
                  <input type="number" className={inputCls} min={0} max={23} value={form.active_hours_start} onChange={e => set("active_hours_start", Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Active Hours End (1–24)</label>
                  <input type="number" className={inputCls} min={1} max={24} value={form.active_hours_end} onChange={e => set("active_hours_end", Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Jitter Min (minutes)</label>
                  <input type="number" className={inputCls} min={1} max={60} value={form.send_jitter_min} onChange={e => set("send_jitter_min", Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>Jitter Max (minutes)</label>
                  <input type="number" className={inputCls} min={1} max={120} value={form.send_jitter_max} onChange={e => set("send_jitter_max", Number(e.target.value))} />
                </div>
              </div>
              <div className="border-t border-neutral-100 dark:border-neutral-800 pt-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Volume Ramp</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Ramp Type</label>
                    <select className={inputCls} value={form.ramp_type} onChange={e => set("ramp_type", e.target.value)}>
                      <option value="linear">Linear (+N emails/day)</option>
                      <option value="custom">Custom Array</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Max Daily Target</label>
                    <input type="number" className={inputCls} min={1} max={200} value={form.max_daily_target} onChange={e => set("max_daily_target", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={labelCls}>Start Volume</label>
                    <input type="number" className={inputCls} min={1} max={20} value={form.start_volume} onChange={e => set("start_volume", Number(e.target.value))} />
                  </div>
                  {form.ramp_type === "linear" ? (
                    <div>
                      <label className={labelCls}>Daily Increment (+emails/day)</label>
                      <input type="number" className={inputCls} min={1} max={20} value={form.ramp_increment} onChange={e => set("ramp_increment", Number(e.target.value))} />
                    </div>
                  ) : (
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Custom Caps (comma-separated, per-day)</label>
                      <input className={inputCls} placeholder="2, 4, 6, 10, 15, 20, 30" value={form.custom_ramp_caps} onChange={e => set("custom_ramp_caps", e.target.value)} />
                      <p className="text-xs text-neutral-400 mt-1">Day 1 = first value, Day 2 = second, etc.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: AI Content ── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">AI Content Engine</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Configure AI-generated warmup email content — using any provider you have already set up in Integrations.</p>
              </div>

              {/* Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-4">
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Enable AI Content</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Generate realistic warmup emails automatically.</p>
                </div>
                <button
                  type="button"
                  onClick={() => set("ai_enabled", !form.ai_enabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${form.ai_enabled ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-800"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full transition-transform ${form.ai_enabled ? "translate-x-6 bg-white dark:bg-neutral-900" : "translate-x-1 bg-neutral-400"}`} />
                </button>
              </div>

              {form.ai_enabled && (
                <>
                  {/* Provider selection */}
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>AI Provider *</label>
                      <div className="flex gap-2">
                        <select
                          className={`${inputCls} flex-1`}
                          value={form.ai_provider_key}
                          onChange={e => {
                            const val = e.target.value;
                            set("ai_provider_key", val);
                            const opt = providerOptions.find(p => p.key === val);
                            if (opt?.models && opt.models.length > 0) {
                              setModels(opt.models);
                              set("ai_model", opt.default_model || opt.models[0].id);
                            } else {
                              setModels([]);
                              set("ai_model", "");
                              if (val && val !== "__custom__") {
                                fetchModels(val);
                              }
                            }
                          }}
                        >
                          {providerOptions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => fetchModels(form.ai_provider_key)}
                          disabled={!form.ai_provider_key || fetchingModels}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors shrink-0"
                        >
                          {fetchingModels ? <RiLoader4Line size={13} className="animate-spin" /> : <RiRefreshLine size={13} />}
                          {fetchingModels ? "Fetching…" : "Fetch models"}
                        </button>
                      </div>
                      {customAiProviders.length === 0 && aiIntegrations.length === 0 && (
                        <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
                          <span>No AI providers configured. Add API keys to enable AI content generation.</span>
                          <a href="/settings?tab=integrations" target="_blank" rel="noreferrer" className="font-semibold underline ml-2 shrink-0 hover:text-amber-900 dark:hover:text-amber-100">
                            Configure in Settings →
                          </a>
                        </div>
                      )}
                    </div>

                    {form.ai_provider_key === "__custom__" && (
                      <div className="space-y-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                        <div>
                          <label className={labelCls}>Custom Base URL (OpenAI-compatible)</label>
                          <input className={inputCls} placeholder="https://api.example.com/v1" value={form.ai_base_url} onChange={e => set("ai_base_url", e.target.value)} />
                        </div>
                      </div>
                    )}

                    {models.length > 0 && (
                      <div>
                        <label className={labelCls}>Model ({models.length} available)</label>
                        <select className={inputCls} value={form.ai_model} onChange={e => set("ai_model", e.target.value)}>
                          {models.map(m => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
                        </select>
                      </div>
                    )}

                    {models.length === 0 && form.ai_provider_key && form.ai_provider_key !== "" && (
                      <div>
                        <label className={labelCls}>Model ID (enter manually)</label>
                        <input className={inputCls} placeholder="e.g. google/gemini-2.5-flash" value={form.ai_model} onChange={e => set("ai_model", e.target.value)} />
                      </div>
                    )}
                  </div>

                  {/* Prompts */}
                  <div className="border-t border-neutral-100 dark:border-neutral-800 pt-5 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Prompt Configuration</h4>
                    <div>
                      <label className={labelCls}>System Prompt</label>
                      <textarea
                        className={`${inputCls} resize-y`}
                        rows={4}
                        value={form.ai_system_prompt}
                        onChange={e => set("ai_system_prompt", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>User Prompt Template</label>
                      <p className="text-xs text-neutral-400 mb-1.5">Use <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">{"{{topic}}"}</code> as the topic placeholder.</p>
                      <textarea
                        className={`${inputCls} resize-y`}
                        rows={3}
                        value={form.ai_user_prompt}
                        onChange={e => set("ai_user_prompt", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Few-Shot Examples</label>
                      <p className="text-xs text-neutral-400 mb-1.5">Paste 2–3 example subject + body pairs to guide the AI style.</p>
                      <textarea
                        className={`${inputCls} resize-y font-mono text-xs`}
                        rows={8}
                        value={form.ai_examples}
                        onChange={e => set("ai_examples", e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 5: Circuit Breaker / Safety ── */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Safety & Circuit Breakers</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Automatically pause warmup if health signals fall below safe thresholds.</p>
              </div>
              <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 p-4 text-sm text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-medium">How circuit breakers work</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">The system monitors bounce and spam rates over a rolling 7-day window. If either threshold is exceeded, the campaign is paused and a reason is recorded. You can resume at any time.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Max Bounce Rate (%)</label>
                  <input
                    type="number" step={0.5} min={0.5} max={20}
                    className={inputCls}
                    value={form.circuit_breaker_bounce_pct}
                    onChange={e => set("circuit_breaker_bounce_pct", Number(e.target.value))}
                  />
                  <p className="text-xs text-neutral-400 mt-1">Recommended: 2%</p>
                </div>
                <div>
                  <label className={labelCls}>Max Spam Placement Rate (%)</label>
                  <input
                    type="number" step={0.5} min={0.5} max={20}
                    className={inputCls}
                    value={form.circuit_breaker_spam_pct}
                    onChange={e => set("circuit_breaker_spam_pct", Number(e.target.value))}
                  />
                  <p className="text-xs text-neutral-400 mt-1">Recommended: 5%</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 6: Review ── */}
          {step === 6 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Review & Launch</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Confirm your campaign settings before launching.</p>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Campaign Name", value: form.name },
                  { label: "Target Inboxes", value: `${form.target_inbox_ids.length} selected` },
                  { label: "Peer Pool", value: form.peer_inbox_ids.length > 0 ? `${form.peer_inbox_ids.length} selected (isolated)` : "Global platform pool" },
                  { label: "Timezone", value: form.timezone },
                  { label: "Active Hours", value: `${form.active_hours_start}:00 – ${form.active_hours_end}:00` },
                  { label: "Send Jitter", value: `${form.send_jitter_min}–${form.send_jitter_max} min` },
                  { label: "Volume Ramp", value: form.ramp_type === "linear" ? `Linear +${form.ramp_increment}/day → ${form.max_daily_target}/day` : `Custom caps (${form.custom_ramp_caps})` },
                  { label: "Reply Rate", value: `${form.reply_rate}%` },
                  { label: "AI Content", value: form.ai_enabled ? `Enabled (${form.ai_provider_key || "no provider"} / ${form.ai_model || "auto"})` : "Disabled" },
                  { label: "Circuit Breaker", value: `Bounce > ${form.circuit_breaker_bounce_pct}% or Spam > ${form.circuit_breaker_spam_pct}%` },
                ].map(row => (
                  <div key={row.label} className="flex items-start justify-between gap-4 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 shrink-0">{row.label}</span>
                    <span className="text-xs text-neutral-800 dark:text-neutral-200 text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/95 dark:bg-neutral-900/95 px-6 py-4 rounded-b-2xl shrink-0">
          <button
            type="button"
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <RiArrowLeftLine size={13} /> {step > 1 ? "Back" : "Cancel"}
          </button>
          <div className="flex items-center gap-1.5">
            {STEPS.map(s => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${s.id === step ? "w-5 bg-neutral-900 dark:bg-white" : s.id < step ? "w-3 bg-neutral-400 dark:bg-neutral-500" : "w-3 bg-neutral-200 dark:bg-neutral-700"}`}
              />
            ))}
          </div>
          {step < 6 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 transition-colors"
            >
              Next <RiArrowRightLine size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 dark:bg-white px-5 py-2 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 transition-colors"
            >
              {saving ? <RiLoader4Line size={13} className="animate-spin" /> : <RiFireLine size={13} />}
              {saving ? "Launching…" : "Launch Campaign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
