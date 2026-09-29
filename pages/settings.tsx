import Head from "next/head";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { GetServerSideProps } from "next";
import { useSession } from "next-auth/react";
import { getDb } from "@/lib/db";
import { getServerWorkspace, loginRedirect } from "@/lib/server-workspace";
import { toast } from "sonner";
import {
  RiAddLine, RiDeleteBinLine, RiEditLine, RiMailLine,
  RiShieldCheckLine, RiShieldKeyholeLine, RiSmartphoneLine, RiDownloadLine, RiCheckLine, RiCloseLine,
  RiLockPasswordLine, RiPlugLine, RiServerLine,
  RiLinkedinBoxLine, RiMessage2Line, RiSettings3Line, RiFileCopyLine,
  RiLockLine, RiLockUnlockLine, RiFlashlightLine, RiArrowDownSLine, RiCompassLine,
  RiRobot2Line, RiPauseLine, RiPlayLine, RiEdit2Line, RiFireLine,
  RiRefreshLine, RiLoader4Line
} from "react-icons/ri";
import { ModelPicker, type OrModel } from "@/components/ui/ModelPicker";
import { ALL_TOUR_PAGES, TOUR_PAGE_LABELS, replayPageTour, type TourPage } from "@/lib/tour";
import { DeleteAccountModal } from "@/components/DeleteAccountModal";
import WarmupSettingsModal from "@/components/WarmupSettingsModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "linkedin" | "email" | "proxies" | "templates" | "integrations" | "ai" | "general";

interface ProxyRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string | null;
  has_password: boolean;
  status: "UNTESTED" | "ACTIVE" | "INACTIVE" | "ERROR";
  last_checked_at: string | null;
  response_time_ms: number | null;
  assigned_account_count: number;
  location?: string | null;
  notes?: string | null;
}

interface LiAccount {
  id: string; name: string; email: string;
  is_authenticated: number;
  daily_connection_limit: number; daily_message_limit: number; daily_inmail_limit: number;
  active_hours_start: number; active_hours_end: number;
  proxy_id?: string | null;
  backup_proxy_id?: string | null;
  proxy_status?: string | null;
  backup_proxy_status?: string | null;
  notes?: string | null;
  created_at: string;
}

interface EmailAccount {
  id: string; name: string; from_email: string; from_name: string | null; reply_to: string | null;
  smtp_host: string; smtp_port: number; smtp_secure: number;
  imap_host: string | null; imap_port: number; username: string; imap_username: string | null;
  provider: string;
  daily_email_limit: number; active_hours_start: number; active_hours_end: number;
  timezone: string; working_days: string;
  is_verified: number; signature: string | null;
  ramp_up_enabled: number; ramp_start_date: string | null;
  paused_at: string | null; paused_reason: string | null;
  created_at: string;
  active_run_count: number;
  warmup?: {                             // 👈 ADD THIS HERE
    enabled?: boolean;
    max_target?: number;
    ramp_increment?: number;
    start_volume?: number;
    reply_rate?: number;
    ai_content_enabled?: boolean;
    pool_id?: string | null;
    timezone?: string;
    active_hours_start?: number;
    active_hours_end?: number;
    send_jitter_min?: number;
    send_jitter_max?: number;
    ramp_type?: string;
    custom_ramp_caps?: string | null;
    ai_provider?: string;
    ai_prompt_template?: string;
    paused_reason?: string | null;
  };
}

interface Template {
  id: number; name: string; body: string; created_at: string;
}

// ─── Server-side data ─────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async ({ query, req, res }) => {
  const db = getDb();
  const workspace = await getServerWorkspace(req, res);
  if (!workspace) return loginRedirect(req);
  const { workspaceId } = workspace;
  const liAccounts = db
    .prepare(
      `SELECT a.id, a.name, a.email, a.is_authenticated, a.daily_connection_limit, a.daily_message_limit, a.daily_inmail_limit,
              a.active_hours_start, a.active_hours_end, a.timezone, a.working_days, a.created_at,
              a.proxy_id, a.backup_proxy_id, a.notes, p.status as proxy_status
        FROM accounts a
        LEFT JOIN proxies p ON a.proxy_id = p.id
        WHERE a.workspace_id=? AND (a.deleted_at IS NULL OR a.deleted_at = '') ORDER BY a.created_at DESC`
    )
    .all(workspaceId);
  const rawEmailAccounts = db
    .prepare(`SELECT ea.id, ea.name, ea.from_email, ea.from_name, ea.reply_to, ea.smtp_host, ea.smtp_port, ea.smtp_secure, ea.imap_host, ea.imap_port, ea.username, ea.daily_email_limit, ea.active_hours_start, ea.active_hours_end, ea.timezone, ea.working_days, ea.is_verified, ea.signature, ea.ramp_up_enabled, ea.ramp_start_date, ea.provider, ea.paused_at, ea.paused_reason, ea.created_at,
              ws.enabled AS warmup_enabled, ws.max_daily_target AS warmup_max_target, ws.ramp_increment AS warmup_ramp_increment, ws.start_volume AS warmup_start_volume, ws.reply_rate AS warmup_reply_rate, ws.ai_content_enabled AS warmup_ai_content_enabled,
              ws.pool_id AS warmup_pool_id, ws.timezone AS warmup_timezone, ws.active_hours_start AS warmup_active_hours_start, ws.active_hours_end AS warmup_active_hours_end, ws.send_jitter_min AS warmup_send_jitter_min, ws.send_jitter_max AS warmup_send_jitter_max, ws.ramp_type AS warmup_ramp_type, ws.custom_ramp_caps AS warmup_custom_ramp_caps, ws.ai_provider AS warmup_ai_provider, ws.ai_prompt_template AS warmup_ai_prompt_template, ws.paused_reason AS warmup_paused_reason
              FROM email_accounts ea LEFT JOIN warmup_settings ws ON ws.email_account_id = ea.id
              WHERE ea.workspace_id=? ORDER BY ea.created_at DESC`)
    .all(workspaceId) as Array<Record<string, unknown>> & { active_run_count?: number }[];
  const emailAccounts = rawEmailAccounts.map((row) => {
    const { warmup_enabled, warmup_max_target, warmup_ramp_increment, warmup_start_volume, warmup_reply_rate, warmup_ai_content_enabled, 
            warmup_pool_id, warmup_timezone, warmup_active_hours_start, warmup_active_hours_end, warmup_send_jitter_min, warmup_send_jitter_max, warmup_ramp_type, warmup_custom_ramp_caps, warmup_ai_provider, warmup_ai_prompt_template, warmup_paused_reason,
            ...account } = row;
    return {
      ...account,
      active_run_count: account.active_run_count ?? 0,
      warmup: warmup_enabled == null ? null : {
        enabled: warmup_enabled === 1,
        max_target: warmup_max_target,
        ramp_increment: warmup_ramp_increment,
        start_volume: warmup_start_volume,
        reply_rate: warmup_reply_rate,
        ai_content_enabled: warmup_ai_content_enabled === 1,
        pool_id: warmup_pool_id,
        timezone: warmup_timezone,
        active_hours_start: warmup_active_hours_start,
        active_hours_end: warmup_active_hours_end,
        send_jitter_min: warmup_send_jitter_min,
        send_jitter_max: warmup_send_jitter_max,
        ramp_type: warmup_ramp_type,
        custom_ramp_caps: warmup_custom_ramp_caps,
        ai_provider: warmup_ai_provider,
        ai_prompt_template: warmup_ai_prompt_template,
        paused_reason: warmup_paused_reason,
      },
    };
  });
  const templates = db.prepare("SELECT * FROM templates WHERE workspace_id=? ORDER BY created_at DESC").all(workspaceId);

  const proxies = db.prepare(`
    SELECT p.id, p.workspace_id, p.name, p.host, p.port, p.protocol, p.username, 
           CASE WHEN p.password IS NOT NULL THEN 1 ELSE 0 END as has_password, 
           p.status, p.last_checked_at, p.response_time_ms, p.location, p.notes,
           p.created_at, p.updated_at,
           COUNT(a.id) as assigned_account_count
    FROM proxies p
    LEFT JOIN accounts a ON a.proxy_id = p.id AND (a.deleted_at IS NULL OR a.deleted_at = '')
    WHERE p.workspace_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(workspaceId);

  const validTabs: Tab[] = ["linkedin", "email", "proxies", "templates", "integrations", "ai", "general"];
  const tab: Tab = validTabs.includes(query.tab as Tab) ? (query.tab as Tab) : "linkedin";
  const pools = db.prepare("SELECT * FROM warmup_pools WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY name ASC").all(workspaceId);
  return { props: { liAccounts, emailAccounts, templates, initialProxies: proxies, initialTab: tab, availablePools: pools } };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "linkedin", label: "LinkedIn", icon: RiLinkedinBoxLine },
  { key: "email", label: "Email", icon: RiMailLine },
  { key: "proxies", label: "Proxies", icon: RiServerLine },
  { key: "templates", label: "Templates", icon: RiMessage2Line },
  { key: "integrations", label: "Integrations", icon: RiPlugLine },
  { key: "ai", label: "AI", icon: RiRobot2Line },
  { key: "general", label: "General", icon: RiSettings3Line },
];

const PRESET_CONFIGS: Record<string, { smtp_host: string; smtp_port: number; smtp_secure: number; imap_host: string; imap_port: number }> = {
  gmail: { smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_secure: 0, imap_host: "imap.gmail.com", imap_port: 993 },
  outlook: { smtp_host: "smtp-mail.outlook.com", smtp_port: 587, smtp_secure: 0, imap_host: "outlook.office365.com", imap_port: 993 },
  custom: { smtp_host: "", smtp_port: 587, smtp_secure: 0, imap_host: "", imap_port: 993 },
};

const BLANK_EMAIL_FORM = {
  preset: "custom", name: "", from_email: "", from_name: "", reply_to: "",
  smtp_host: "", smtp_port: 587, smtp_secure: 0,
  imap_host: "", imap_port: 993, username: "", password: "",
  imap_username: "", imap_password: "",
  daily_email_limit: 50, active_hours_start: 9, active_hours_end: 18,
  timezone: "Europe/Berlin", working_days: "1,2,3,4,5", signature: "",
  ramp_up_enabled: true,
  ramp_start_date: new Date().toISOString().slice(0, 10),
};

function blankGmailForm() {
  const browserTimezone = typeof Intl === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    email: "",
    app_password: "",
    from_name: "",
    name: "",
    daily_email_limit: 50,
    timezone: TIMEZONES.some((timezone) => timezone.value === browserTimezone) ? browserTimezone : "UTC",
  };
}

const TIMEZONES = [
  { value: "Pacific/Midway", label: "UTC−11 — Midway Island" },
  { value: "Pacific/Honolulu", label: "UTC−10 — Hawaii" },
  { value: "America/Anchorage", label: "UTC−9  — Alaska" },
  { value: "America/Los_Angeles", label: "UTC−8  — Pacific Time (US)" },
  { value: "America/Denver", label: "UTC−7  — Mountain Time (US)" },
  { value: "America/Chicago", label: "UTC−6  — Central Time (US)" },
  { value: "America/New_York", label: "UTC−5  — Eastern Time (US)" },
  { value: "America/Caracas", label: "UTC−4  — Caracas, La Paz" },
  { value: "America/Sao_Paulo", label: "UTC−3  — São Paulo, Buenos Aires" },
  { value: "America/Noronha", label: "UTC−2  — Mid-Atlantic" },
  { value: "Atlantic/Azores", label: "UTC−1  — Azores" },
  { value: "UTC", label: "UTC+0  — London (no DST)" },
  { value: "Europe/London", label: "UTC+0/+1 — London (BST)" },
  { value: "Europe/Paris", label: "UTC+1/+2 — Paris, Berlin, Amsterdam" },
  { value: "Europe/Helsinki", label: "UTC+2/+3 — Helsinki, Kyiv, Tallinn" },
  { value: "Europe/Moscow", label: "UTC+3  — Moscow, Istanbul" },
  { value: "Asia/Dubai", label: "UTC+4  — Dubai, Abu Dhabi" },
  { value: "Asia/Karachi", label: "UTC+5  — Karachi, Islamabad" },
  { value: "Asia/Kolkata", label: "UTC+5:30 — India" },
  { value: "Asia/Dhaka", label: "UTC+6  — Dhaka, Almaty" },
  { value: "Asia/Bangkok", label: "UTC+7  — Bangkok, Jakarta, Hanoi" },
  { value: "Asia/Shanghai", label: "UTC+8  — Beijing, Singapore, HK" },
  { value: "Asia/Tokyo", label: "UTC+9  — Tokyo, Seoul" },
  { value: "Australia/Sydney", label: "UTC+10/+11 — Sydney" },
  { value: "Pacific/Auckland", label: "UTC+12/+13 — Auckland" },
];

const WEEKDAYS = [
  { iso: 1, short: "Mon" },
  { iso: 2, short: "Tue" },
  { iso: 3, short: "Wed" },
  { iso: 4, short: "Thu" },
  { iso: 5, short: "Fri" },
  { iso: 6, short: "Sat" },
  { iso: 7, short: "Sun" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

// Standard merge tags supported by the render engine (lib/outreach/render.ts).
const STANDARD_VARS = ["first_name", "last_name", "full_name", "company", "title", "location"];
type VarChip = { token: string; label: string; custom: boolean };
function buildVarChips(customFields: { key: string }[]): VarChip[] {
  const std: VarChip[] = STANDARD_VARS.map((k) => ({ token: `{{${k}}}`, label: k, custom: false }));
  const custom: VarChip[] = customFields
    .filter((f) => f.key && !STANDARD_VARS.includes(f.key))
    .map((f) => ({ token: `{{${f.key}}}`, label: f.key, custom: true }));
  return [...std, ...custom];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage({
  liAccounts: initialLi,
  emailAccounts: initialEmail,
  templates: initialTemplates,
  initialProxies,
  initialTab,
  availablePools,
}: {
  liAccounts: LiAccount[];
  emailAccounts: EmailAccount[];
  templates: Template[];
  initialProxies: ProxyRecord[];
  initialTab: Tab;
  availablePools: { id: string; name: string; type: string }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);

  const [hasMcp, setHasMcp] = useState(false);
  useEffect(() => {
    fetch("/api/premium-status").then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setHasMcp(!!d.capabilities?.mcp); }).catch(() => { });
  }, []);
  const visibleTabs = TABS;

  function switchTab(t: Tab) {
    setTab(t);
    router.replace(`/settings?tab=${t}`, undefined, { shallow: true });
  }

  return (
    <>
      <Head>
        <title>Settings — Outbount</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="max-w-6xl w-full mx-auto pb-12">
        {/* Page header */}
        <div className="mb-6">
          <p className="mb-2 text-[13px] font-medium text-base-content/45">Workspace</p>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-.03em] text-base-content">Settings</h1>
          <p className="mt-2 text-[15px] text-base-content/50">Accounts, integrations, and preferences.</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-[var(--border-subtle)] relative">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide" style={{ marginBottom: "-1px" }}>
            {visibleTabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                data-tour={`settings-tab-${key}`}
                onClick={() => switchTab(key)}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === key
                  ? "border-primary text-base-content"
                  : "border-transparent text-base-content/40 hover:text-base-content/70"
                  }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {tab === "linkedin" && <LinkedInTab initialAccounts={initialLi} initialProxies={initialProxies} />}
        {tab === "email" && <EmailTab initialAccounts={initialEmail} availablePools={availablePools} />}
        {tab === "proxies" && <ProxiesTab initialProxies={initialProxies} />}
        {tab === "templates" && <TemplatesTab initialTemplates={initialTemplates} />}
        {tab === "integrations" && <IntegrationsTab />}
        {tab === "ai" && <AiTab />}
        {tab === "general" && <GeneralTab hasMcp={hasMcp} />}
      </div>
    </>
  );
}

// ─── LinkedIn Tab ─────────────────────────────────────────────────────────────

function formatProxyLabel(p: ProxyRecord) {
  const loc = p.location ? p.location.trim() : "";
  const nameOrHost = p.name && p.name !== `${p.host}:${p.port}` ? `${p.name} (${p.host}:${p.port})` : `${p.host}:${p.port}`;
  return loc ? `${loc} · ${nameOrHost}` : nameOrHost;
}

function LinkedInTab({ initialAccounts, initialProxies }: { initialAccounts: LiAccount[], initialProxies: ProxyRecord[] }) {
  const [accounts, setAccounts] = useState<LiAccount[]>(initialAccounts);
  const [proxies] = useState<ProxyRecord[]>(initialProxies);
  const [showModal, setShowModal] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", daily_connection_limit: 20, daily_message_limit: 50, daily_inmail_limit: 15, proxy_id: "", backup_proxy_id: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [authModal, setAuthModal] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "cookies">("login");
  const [authForm, setAuthForm] = useState({ li_at: "", document_cookie: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "", code: "" });
  const [loginStage, setLoginStage] = useState<"creds" | "code" | "approve">("creds");
  const [challengeMsg, setChallengeMsg] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [accountToDelete, setAccountToDelete] = useState<LiAccount | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  async function handleDisconnect(accountId: string) {
    setDisconnectingId(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/disconnect`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Account disconnected");
      refresh();
    } catch {
      toast.error("Failed to disconnect account");
    } finally {
      setDisconnectingId(null);
    }
  }

  const [testingProxy, setTestingProxy] = useState<{ accountId: string, type: 'primary' | 'backup' } | null>(null);
  const [showBackupProxies, setShowBackupProxies] = useState<Set<string>>(new Set());

  function toggleBackupProxy(accountId: string) {
    setShowBackupProxies(prev => {
      const next = new Set(prev);
      next.has(accountId) ? next.delete(accountId) : next.add(accountId);
      return next;
    });
  }

  async function testSpecificProxy(accountId: string, proxyId: string, type: 'primary' | 'backup') {
    if (!proxyId) return;
    setTestingProxy({ accountId, type });
    try {
      // Call the endpoint with the type query parameter so it tests and saves the correct proxy
      const res = await fetch(`/api/accounts/${accountId}/test-proxy?type=${type}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");

      if (data.status === "ACTIVE") {
        toast.success(`${type === 'primary' ? 'Primary' : 'Backup'} Proxy ACTIVE (${data.response_time_ms}ms)`);
      } else {
        toast.error(`${type === 'primary' ? 'Primary' : 'Backup'} Proxy check failed. Status: ${data.status}`);
      }

      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTestingProxy(null);
    }
  }

  async function updateAccountProxy(accountId: string, proxyId: string) {
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proxy_id: proxyId || null })
    });
    if (res.ok) {
      toast.success("Primary proxy updated");
      refresh();
    } else {
      toast.error("Failed to update primary proxy");
    }
  }

  async function updateAccountBackupProxy(accountId: string, proxyId: string) {
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup_proxy_id: proxyId || null })
    });
    if (res.ok) {
      toast.success("Backup proxy updated");
      refresh();
    } else {
      toast.error("Failed to update backup proxy");
    }
  }

  function openEditAccount(acc: LiAccount) {
    setEditAccountId(acc.id);
    setForm({
      name: acc.name,
      email: acc.email,
      daily_connection_limit: acc.daily_connection_limit,
      daily_message_limit: acc.daily_message_limit,
      daily_inmail_limit: acc.daily_inmail_limit,
      proxy_id: acc.proxy_id || "",
      backup_proxy_id: acc.backup_proxy_id || "",
      notes: acc.notes || "",
    });
    setShowModal(true);
  }

  function openAddAccount() {
    setEditAccountId(null);
    setForm({ name: "", email: "", daily_connection_limit: 20, daily_message_limit: 50, daily_inmail_limit: 15, proxy_id: "", backup_proxy_id: "", notes: "" });
    setShowModal(true);
  }

  function openAuthModal(account: LiAccount) {
    setAuthModal(account.id);
    setAuthMode("login");
    setLoginStage("creds");
    setChallengeMsg("");
    setLoginForm({ email: account.email ?? "", password: "", code: "" });
    setAuthForm({ li_at: "", document_cookie: "" });
  }

  function closeAuthModal() {
    setAuthModal(null);
    setLoginStage("creds");
    setChallengeMsg("");
    setLoginForm({ email: "", password: "", code: "" });
    setAuthForm({ li_at: "", document_cookie: "" });
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!authModal) return;
    setAuthLoading(true);
    const body =
      loginStage === "creds"
        ? { step: "start", email: loginForm.email, password: loginForm.password }
        : loginStage === "approve"
          ? { step: "await" }
          : { step: "verify", code: loginForm.code };
    const res = await fetch(`/api/accounts/${authModal}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setAuthLoading(false);
    if (!res.ok) { toast.error(data.error ?? "Login failed"); return; }
    if (data.status === "authenticated") {
      toast.success("Logged in successfully");
      closeAuthModal();
      refresh();
    } else if (data.status === "challenge" && data.kind === "captcha") {
      toast.error(data.message);
      setAuthMode("cookies");
    } else if (data.status === "challenge") {
      setChallengeMsg(data.message ?? "");
      if (data.kind === "app") {
        if (loginStage === "approve") toast.error("Still waiting — approve the request in your LinkedIn app, then click Continue.");
        setLoginStage("approve");
      } else {
        setLoginStage("code");
        setLoginForm((f) => ({ ...f, code: "" }));
      }
    } else {
      toast.error(data.message ?? "Login failed");
    }
  }

  async function refresh() {
    const res = await fetch("/api/accounts");
    setAccounts(await res.json());
  }

  async function createOrEditAccount(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const url = editAccountId ? `/api/accounts/${editAccountId}` : "/api/accounts";
    const method = editAccountId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Failed"); return; }
    toast.success(editAccountId ? "Account updated" : "Account created");
    setShowModal(false);
    setEditAccountId(null);
    setForm({ name: "", email: "", daily_connection_limit: 20, daily_message_limit: 50, daily_inmail_limit: 15, proxy_id: "", backup_proxy_id: "", notes: "" });
    refresh();
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!authModal) return;
    setAuthLoading(true);
    const res = await fetch(`/api/accounts/${authModal}/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authForm),
    });
    setAuthLoading(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Authentication failed"); return; }
    toast.success("Account authenticated");
    closeAuthModal();
    refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-base-content/50">LinkedIn accounts used for browser automation</p>
        <button
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
          onClick={openAddAccount}
        >
          <RiAddLine size={14} /> Add Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-12 text-base-content/30 text-sm border border-dashed border-[var(--border)] rounded-2xl">
          No LinkedIn accounts yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] hover:border-[var(--border)] transition-colors"
            >
              {/* Account Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-base font-bold shrink-0">
                  {a.name ? a.name.charAt(0).toUpperCase() : "?"}
                </div>
                <div className="min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-base-content truncate">{a.name}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${a.is_authenticated ? "bg-success/15 text-success" : "bg-base-200 text-base-content/50"}`}>
                      {a.is_authenticated ? <><RiCheckLine size={12} /> Auth</> : "Unauth"}
                    </span>
                  </div>
                  <p className="text-xs text-base-content/50 truncate mt-0.5">
                    {a.email} · {a.daily_connection_limit} conn/d · {a.daily_message_limit} msg/d · {a.daily_inmail_limit} inmail/d
                  </p>

                  {/* Fixed Notes Section */}
                  {a.notes && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-base-content/60 bg-base-200/60 px-2 py-1 rounded-md w-fit max-w-md">
                      {/* Clean SVG Document Icon */}
                      <svg className="w-3 h-3 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="truncate">{a.notes}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Controls & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 flex-wrap">
                {/* Dual Proxy Selectors */}
                <div className="flex flex-col gap-1.5 bg-base-200/50 px-3 py-2 rounded-xl border border-[var(--border-subtle)] w-[280px] shrink-0">
                  <span className="text-[9px] font-bold text-base-content/40 uppercase tracking-wider pl-1">Proxies</span>

                  {/* Primary Proxy */}
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-[10px] text-base-content/40 shrink-0 w-[45px]">Primary</span>

                    {/* CUSTOM SEPARATED DROPDOWN */}
                    <div className="relative flex-1 min-w-0 flex items-center">
                      <div className="flex items-center w-full gap-1">
                        {/* 1. The Main Info Pill */}
                        <div className="flex-1 min-w-0 h-6 px-2 bg-base-100 border border-base-content/20 rounded-md flex items-center overflow-hidden">
                          <span className="text-[10px] font-mono truncate text-base-content/90">
                            {(() => {
                              const selected = proxies.find(p => p.id === a.proxy_id);
                              return selected ? formatProxyLabel(selected) : "None";
                            })()}
                          </span>
                        </div>
                        {/* 2. The Separate Dropdown Button Box */}
                        <div className="h-6 w-6 shrink-0 bg-base-100 border border-base-content/20 rounded-md flex items-center justify-center">
                          <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* 3. The Invisible Native Select */}
                      <select
                        value={a.proxy_id || ""}
                        onChange={(e) => updateAccountProxy(a.id, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title="Primary Proxy"
                      >
                        <option value="">None</option>
                        {proxies.map(p => <option key={p.id} value={p.id}>{formatProxyLabel(p)}</option>)}
                      </select>
                    </div>

                    <button
                      disabled={!a.proxy_id || (testingProxy?.accountId === a.id && testingProxy?.type === 'primary')}
                      onClick={() => a.proxy_id && testSpecificProxy(a.id, a.proxy_id, 'primary')}
                      className="btn btn-xs btn-ghost px-1 text-base-content/50 hover:text-primary transition-colors shrink-0 disabled:opacity-30"
                      title="Test Primary Proxy"
                    >
                      {testingProxy?.accountId === a.id && testingProxy?.type === 'primary' ? (
                        <span className="loading loading-spinner w-3" />
                      ) : (
                        <RiShieldCheckLine size={12} className={a.proxy_status === "ACTIVE" ? "text-success" : a.proxy_status === "ERROR" ? "text-error" : ""} />
                      )}
                    </button>
                  </div>

                  {/* Backup Proxy — shown when already set OR user clicks add */}
                  {(a.backup_proxy_id || showBackupProxies.has(a.id)) ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <span className="text-[10px] text-base-content/40 shrink-0 w-[45px]">Backup</span>

                      {/* CUSTOM SEPARATED DROPDOWN */}
                      <div className="relative flex-1 min-w-0 flex items-center">
                        <div className="flex items-center w-full gap-1">
                          {/* 1. The Main Info Pill */}
                          <div className="flex-1 min-w-0 h-6 px-2 bg-base-100 border border-base-content/20 rounded-md flex items-center overflow-hidden">
                            <span className="text-[10px] font-mono truncate text-base-content/90">
                              {(() => {
                                const selected = proxies.find(p => p.id === a.backup_proxy_id);
                                return selected ? formatProxyLabel(selected) : "None";
                              })()}
                            </span>
                          </div>
                          {/* 2. The Separate Dropdown Button Box */}
                          <div className="h-6 w-6 shrink-0 bg-base-100 border border-base-content/20 rounded-md flex items-center justify-center">
                            <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>

                        {/* 3. The Invisible Native Select */}
                        <select
                          value={a.backup_proxy_id || ""}
                          onChange={(e) => updateAccountBackupProxy(a.id, e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title="Backup Proxy"
                        >
                          <option value="">None</option>
                          {proxies.map(p => <option key={p.id} value={p.id}>{formatProxyLabel(p)}</option>)}
                        </select>
                      </div>

                      <button
                        disabled={!a.backup_proxy_id || (testingProxy?.accountId === a.id && testingProxy?.type === 'backup')}
                        onClick={() => a.backup_proxy_id && testSpecificProxy(a.id, a.backup_proxy_id, 'backup')}
                        className="btn btn-xs btn-ghost px-1 text-base-content/50 hover:text-primary transition-colors shrink-0 disabled:opacity-30"
                        title="Test Backup Proxy"
                      >
                        {testingProxy?.accountId === a.id && testingProxy?.type === 'backup' ? (
                          <span className="loading loading-spinner w-3" />
                        ) : (
                          <RiShieldCheckLine
                            size={12}
                            className={
                              ((a.backup_proxy_status || (a as any).backup_status)?.toUpperCase() === 'ACTIVE')
                                ? 'text-success'
                                : ((a.backup_proxy_status || (a as any).backup_status)?.toUpperCase() === 'ERROR')
                                  ? 'text-error'
                                  : ''
                            }
                          />
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleBackupProxy(a.id)}
                      className="inline-flex items-center gap-1 text-[10px] text-base-content/40 hover:text-primary transition-colors px-1 py-0.5 rounded"
                    >
                      <RiAddLine size={10} /> Add backup proxy
                    </button>
                  )}
                </div>

                {/* Account Action Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                    onClick={() => openAuthModal(a)}
                  >
                    <RiShieldKeyholeLine size={12} /> {a.is_authenticated ? "Re-auth" : "Auth"}
                  </button>

                  {!!a.is_authenticated && (
                    <button
                      disabled={disconnectingId === a.id}
                      onClick={() => handleDisconnect(a.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-base-200 text-base-content/70 hover:bg-base-300 transition-colors disabled:opacity-50"
                    >
                      {disconnectingId === a.id ? "Disconnecting..." : "Disconnect"}
                    </button>
                  )}

                  <button
                    onClick={() => openEditAccount(a)}
                    className="btn btn-xs btn-ghost text-base-content/50 hover:text-base-content"
                    title="Edit Account Limits, Proxies & Notes"
                  >
                    <RiEdit2Line size={14} />
                  </button>

                  <button
                    onClick={() => setAccountToDelete(a)}
                    className="btn btn-xs btn-ghost text-base-content/50 hover:text-error"
                    title="Delete Account"
                  >
                    <RiDeleteBinLine size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-modal)] max-w-md">
            <h3 className="font-semibold text-base mb-4">{editAccountId ? "Edit LinkedIn Account" : "Add LinkedIn Account"}</h3>
            <form onSubmit={createOrEditAccount} className="flex flex-col gap-3">
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Display name</label>
                <input className="input input-bordered input-sm w-full" placeholder="e.g. Mohammad LinkedIn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Email</label>
                <input type="email" className="input input-bordered input-sm w-full" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Connections/day</label>
                  <input type="number" className="input input-bordered input-sm w-full" value={form.daily_connection_limit} onChange={(e) => setForm({ ...form, daily_connection_limit: Number(e.target.value) })} min={1} max={100} />
                </div>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Messages/day</label>
                  <input type="number" className="input input-bordered input-sm w-full" value={form.daily_message_limit} onChange={(e) => setForm({ ...form, daily_message_limit: Number(e.target.value) })} min={1} max={200} />
                </div>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">InMail/day</label>
                  <input type="number" className="input input-bordered input-sm w-full" value={form.daily_inmail_limit} onChange={(e) => setForm({ ...form, daily_inmail_limit: Number(e.target.value) })} min={1} max={100} />
                </div>
              </div>

              {/* Proxy Dropdowns with Fixed Truncation */}
              <div className="grid grid-cols-2 gap-3 mt-1">

                {/* Primary Proxy */}
                <div className="min-w-0">
                  <label className="label text-xs text-base-content/50 pb-1 px-0">Primary Proxy (Optional)</label>
                  <div className="relative w-full flex items-center">
                    <div className="flex items-center w-full gap-1">
                      {/* 1. Main Info Pill */}
                      <div className="flex-1 min-w-0 h-8 px-3 bg-base-100 border border-base-content/20 rounded-lg flex items-center overflow-hidden">
                        <span className="text-xs truncate text-base-content/90 font-mono">
                          {(() => {
                            const selected = proxies.find(p => p.id === form.proxy_id);
                            return selected ? formatProxyLabel(selected) : "No Proxy";
                          })()}
                        </span>
                      </div>
                      {/* 2. Dropdown Button */}
                      <div className="h-8 w-8 shrink-0 bg-base-100 border border-base-content/20 rounded-lg flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* 3. Invisible Native Select */}
                    <select
                      value={form.proxy_id || ""}
                      onChange={(e) => setForm({ ...form, proxy_id: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    >
                      <option value="">No Proxy</option>
                      {proxies.map(p => <option key={p.id} value={p.id}>{formatProxyLabel(p)}</option>)}
                    </select>
                  </div>
                </div>

                {/* Backup Proxy */}
                <div className="min-w-0">
                  <label className="label text-xs text-base-content/50 pb-1 px-0">Backup Proxy (Optional)</label>
                  <div className="relative w-full flex items-center">
                    <div className="flex items-center w-full gap-1">
                      {/* 1. Main Info Pill */}
                      <div className="flex-1 min-w-0 h-8 px-3 bg-base-100 border border-base-content/20 rounded-lg flex items-center overflow-hidden">
                        <span className="text-xs truncate text-base-content/90 font-mono">
                          {(() => {
                            const selected = proxies.find(p => p.id === form.backup_proxy_id);
                            return selected ? formatProxyLabel(selected) : "No Backup Proxy";
                          })()}
                        </span>
                      </div>
                      {/* 2. Dropdown Button */}
                      <div className="h-8 w-8 shrink-0 bg-base-100 border border-base-content/20 rounded-lg flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* 3. Invisible Native Select */}
                    <select
                      value={form.backup_proxy_id || ""}
                      onChange={(e) => setForm({ ...form, backup_proxy_id: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    >
                      <option value="">No Backup Proxy</option>
                      {proxies.map(p => <option key={p.id} value={p.id}>{formatProxyLabel(p)}</option>)}
                    </select>
                  </div>
                </div>

              </div>
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Notes (Optional)</label>
                <input className="input input-bordered input-sm w-full text-xs" placeholder="e.g. Dedicated US Proxy assigned for Sales Campaign" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="modal-action mt-2">
                <button type="button" className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={loading}>
                  {loading ? <span className="loading loading-spinner loading-xs" /> : editAccountId ? "Save Changes" : "Add Account"}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setShowModal(false)} />
        </div>
      )}

      {/* Auth modal */}
      {authModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-modal)] max-w-lg">
            <h3 className="font-semibold text-base mb-1">Authenticate LinkedIn Account</h3>

            {/* Mode toggle */}
            <div className="inline-flex rounded-[10px] bg-base-200 p-1 mb-4 mt-2">
              <button
                type="button"
                onClick={() => { setAuthMode("login"); setLoginStage("creds"); }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${authMode === "login" ? "bg-primary text-primary-content" : "text-base-content/60 hover:text-base-content"}`}
              >
                Server login
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("cookies")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${authMode === "cookies" ? "bg-primary text-primary-content" : "text-base-content/60 hover:text-base-content"}`}
              >
                Paste cookies
              </button>
            </div>

            {authMode === "login" ? (
              <form onSubmit={submitLogin} className="flex flex-col gap-3">
                <p className="text-xs text-base-content/50 -mt-1">
                  Logs in on the server under the runner&apos;s exact browser fingerprint and captures all cookies. LinkedIn may ask for a code or a device approval.
                </p>
                {loginStage === "creds" ? (
                  <>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Email <span className="text-error">*</span></label>
                      <input type="email" autoComplete="off" className="input input-bordered input-sm w-full" placeholder="you@example.com" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} required />
                    </div>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Password <span className="text-error">*</span></label>
                      <input type="password" autoComplete="off" className="input input-bordered input-sm w-full" placeholder="••••••••" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required />
                    </div>
                  </>
                ) : loginStage === "approve" ? (
                  <div className="bg-base-200 text-base-content/70 text-xs rounded-lg p-3 flex items-start gap-2">
                    <RiSmartphoneLine size={16} className="shrink-0 mt-0.5" />
                    <span>{challengeMsg || "Approve the sign-in request in your LinkedIn mobile app, then click Continue."}</span>
                  </div>
                ) : (
                  <div>
                    <div className="bg-base-200 text-base-content/70 text-xs rounded-lg p-3 mb-2">{challengeMsg}</div>
                    <label className="label text-xs text-base-content/50 pb-1">Verification code <span className="text-error">*</span></label>
                    <input inputMode="numeric" autoComplete="one-time-code" className="input input-bordered input-sm w-full font-mono tracking-widest" placeholder="123456" value={loginForm.code} onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value })} required />
                  </div>
                )}
                <div className="modal-action mt-1">
                  <button type="button" className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" onClick={closeAuthModal}>Cancel</button>
                  <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={authLoading}>
                    {authLoading ? <span className="loading loading-spinner loading-xs" /> : loginStage === "creds" ? "Log in" : loginStage === "approve" ? "I approved — Continue" : "Verify code"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="bg-base-200 border border-[var(--border-subtle)] rounded-[10px] p-3 text-xs text-base-content/60 mb-4 space-y-1.5">
                  <p className="font-medium text-base-content/80">How to get your cookies:</p>
                  <p>1. Open <strong>linkedin.com</strong> in Chrome and make sure you are logged in</p>
                  <p>2. Open DevTools → <strong>Application</strong> → <strong>Cookies</strong> → <strong>https://www.linkedin.com</strong></p>
                  <p>3. Find <strong>li_at</strong> → double-click the Value cell → copy it → paste below</p>
                  <p>4. Open the DevTools <strong>Console</strong> tab → run <code className="bg-base-200 px-1 rounded">document.cookie</code> → copy the output → paste below</p>
                </div>
                <form onSubmit={submitAuth} className="flex flex-col gap-3">
                  <div>
                    <label className="label text-xs text-base-content/50 pb-1">li_at cookie value <span className="text-error">*</span></label>
                    <input className="input input-bordered input-sm w-full font-mono text-xs" placeholder="AQEDATxxxxxx..." value={authForm.li_at} onChange={(e) => setAuthForm({ ...authForm, li_at: e.target.value })} required />
                  </div>
                  <div>
                    <label className="label text-xs text-base-content/50 pb-1">document.cookie output (optional)</label>
                    <textarea className="textarea textarea-bordered w-full font-mono text-xs h-24 resize-none" placeholder={'bcookie="v=2&..."; JSESSIONID="ajax:..."; ...'} value={authForm.document_cookie} onChange={(e) => setAuthForm({ ...authForm, document_cookie: e.target.value })} />
                  </div>
                  <div className="modal-action mt-1">
                    <button type="button" className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" onClick={closeAuthModal}>Cancel</button>
                    <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={authLoading}>
                      {authLoading ? <span className="loading loading-spinner loading-xs" /> : "Save Cookies"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
          <div className="modal-backdrop" onClick={closeAuthModal} />
        </div>
      )}
      <DeleteAccountModal
        account={accountToDelete}
        isOpen={!!accountToDelete}
        onClose={() => setAccountToDelete(null)}
        onSuccess={() => {
          setAccountToDelete(null);
          refresh();
        }}
      />

    </div>
  );

}

// ─── Ramp Diagram ─────────────────────────────────────────────────────────────

function RampDiagram({ startDate, target }: { startDate: string; target: number }) {
  const safeTarget = Math.max(1, target || 0);
  const daysToFull = Math.max(1, Math.ceil(safeTarget / 2));
  const today = new Date();
  const start = startDate ? new Date(startDate) : today;
  const daysActive = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
  const currentLimit = Math.min(safeTarget, Math.max(2, (daysActive + 1) * 2));
  const fullDate = new Date(start.getTime() + (daysToFull - 1) * 86_400_000);

  // Always show a nice curve. If daysToFull is small (e.g. 1), still draw multiple steps for aesthetics.
  const points: { day: number; val: number }[] = [];
  const renderDays = Math.max(7, daysToFull);
  const step = Math.max(1, Math.floor(renderDays / 6));
  for (let d = 1; d <= renderDays; d += step) {
    points.push({ day: d, val: Math.min(safeTarget, d * 2) });
  }
  if (points.length > 0 && points[points.length - 1].day !== renderDays) {
    points.push({ day: renderDays, val: safeTarget });
  }

  const BAR_MAX_PX = 56; // 14 * 4 = h-14

  return (
    <div className="rounded-[10px] bg-base-200 border border-[var(--border-subtle)] p-3">
      <div className="flex items-end gap-1 mb-2" style={{ height: BAR_MAX_PX }}>
        {points.map(({ day, val }, idx) => {
          const heightPx = Math.max(3, Math.round((val / safeTarget) * BAR_MAX_PX));
          const isPast = daysActive + 1 >= day;
          return (
            <div key={`${day}-${idx}`} className="flex-1 flex items-end">
              <div
                className={`w-full rounded-sm ${isPast ? "bg-primary" : "bg-base-200"}`}
                style={{ height: heightPx }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-base-content/40">
        <span>Day 1 — {Math.min(2, safeTarget)}/day</span>
        <span>Day {renderDays} — {safeTarget}/day</span>
      </div>
      <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
        <span className="text-base-content/50">
          Today: <span className="text-base-content font-medium">{target <= 0 ? 0 : currentLimit}/day</span>
        </span>
        {target > 0 && (
          <span className="text-base-content/40">
            Full volume: {fullDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Email Tab ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function EmailTab({ initialAccounts, availablePools }: { initialAccounts: EmailAccount[]; availablePools: { id: string; name: string; type: string }[] }) {
  const [accounts, setAccounts] = useState<EmailAccount[]>(initialAccounts);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [form, setForm] = useState(BLANK_EMAIL_FORM);
  const [gmailForm, setGmailForm] = useState(blankGmailForm);
  const [loading, setLoading] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  // Separate unlock states for SMTP and IMAP credential sections
  const [smtpUnlocked, setSmtpUnlocked] = useState(false);
  const [imapUnlocked, setImapUnlocked] = useState(false);
  const [selectedWarmupAccountId, setSelectedWarmupAccountId] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
  const pageAccounts = accounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function refresh() {
    const res = await fetch("/api/email-accounts");
    const data = await res.json();
    setAccounts(data);
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(data.length / PAGE_SIZE))));
  }

  function openCreate() {
    setEditingAccount(null);
    setForm(BLANK_EMAIL_FORM);
    setSmtpUnlocked(true);
    setImapUnlocked(true);
    setShowModal(true);
  }

  function openGmailConnect() {
    setGmailForm(blankGmailForm());
    setShowGmailModal(true);
  }

  function openDuplicate(a: EmailAccount) {
    setSmtpUnlocked(false);
    setImapUnlocked(false);
    setEditingAccount(null);
    setForm({
      preset: "custom",
      name: `${a.name} (copy)`,
      from_email: a.from_email,
      from_name: a.from_name ?? "",
      reply_to: a.reply_to ?? "",
      smtp_host: a.smtp_host,
      smtp_port: a.smtp_port,
      smtp_secure: a.smtp_secure,
      imap_host: a.imap_host ?? "",
      imap_port: a.imap_port,
      username: a.username,
      password: "",
      imap_username: a.imap_username ?? "",
      imap_password: "",
      daily_email_limit: a.daily_email_limit,
      active_hours_start: a.active_hours_start,
      active_hours_end: a.active_hours_end,
      timezone: a.timezone ?? "UTC",
      working_days: a.working_days ?? "1,2,3,4,5",
      signature: a.signature ?? "",
      ramp_up_enabled: a.ramp_up_enabled === 1,
      ramp_start_date: new Date().toISOString().slice(0, 10),
    });
    setShowModal(true);
  }

  function openEdit(a: EmailAccount) {
    setSmtpUnlocked(false);
    setImapUnlocked(false);
    setEditingAccount(a);
    setForm({
      preset: "custom",
      name: a.name,
      from_email: a.from_email,
      from_name: a.from_name ?? "",
      reply_to: a.reply_to ?? "",
      smtp_host: a.smtp_host,
      smtp_port: a.smtp_port,
      smtp_secure: a.smtp_secure,
      imap_host: a.imap_host ?? "",
      imap_port: a.imap_port,
      username: a.username,
      password: "",
      imap_username: a.imap_username ?? "",
      imap_password: "",
      daily_email_limit: a.daily_email_limit,
      active_hours_start: a.active_hours_start,
      active_hours_end: a.active_hours_end,
      timezone: a.timezone ?? "UTC",
      working_days: a.working_days ?? "1,2,3,4,5",
      signature: a.signature ?? "",
      ramp_up_enabled: a.ramp_up_enabled === 1,
      ramp_start_date: a.ramp_start_date ?? new Date().toISOString().slice(0, 10),
    });
    setShowModal(true);
  }

  function applyPreset(preset: string) {
    const cfg = PRESET_CONFIGS[preset] ?? PRESET_CONFIGS.custom;
    setForm((f) => ({ ...f, preset, ...cfg }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();

    // Uniqueness check for from_email
    const duplicate = accounts.find(
      (a) => a.from_email.toLowerCase() === form.from_email.toLowerCase() &&
        a.id !== editingAccount?.id
    );
    if (duplicate) {
      toast.error(`An account with email ${form.from_email} already exists`);
      return;
    }

    setLoading(true);

    const body: Record<string, unknown> = {
      name: form.name,
      from_email: form.from_email,
      from_name: form.from_name || null,
      reply_to: form.reply_to || null,
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_secure: form.smtp_secure,
      imap_host: form.imap_host || null,
      imap_port: form.imap_port,
      username: form.username,
      imap_username: form.imap_username.trim() || null,
      daily_email_limit: form.daily_email_limit,
      active_hours_start: form.active_hours_start,
      active_hours_end: form.active_hours_end,
      timezone: form.timezone,
      working_days: form.working_days,
      signature: form.signature.trim() || null,
      ramp_up_enabled: form.ramp_up_enabled ? 1 : 0,
      ramp_start_date: form.ramp_start_date || new Date().toISOString().slice(0, 10),
    };
    // Only include password if provided (edit mode: leave blank to keep existing)
    if (form.password) body.password = form.password;
    if (form.imap_password) body.imap_password = form.imap_password;

    let res: Response;
    if (editingAccount) {
      res = await fetch(`/api/email-accounts/${editingAccount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      if (!form.password) { toast.error("SMTP password is required"); setLoading(false); return; }
      res = await fetch("/api/email-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, password: form.password }),
      });
    }

    setLoading(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Failed"); return; }
    toast.success(editingAccount ? "Account updated" : "Account added");
    setShowModal(false);
    setEditingAccount(null);
    refresh();
  }

  async function connectGmail(e: React.FormEvent) {
    e.preventDefault();
    setGmailLoading(true);
    try {
      const res = await fetch("/api/email-accounts/gmail-app-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gmailForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not connect Gmail");
        return;
      }
      toast.success("Gmail connected and verified");
      setShowGmailModal(false);
      setGmailForm(blankGmailForm());
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect Gmail");
    } finally {
      setGmailLoading(false);
    }
  }

  async function testConnection(id: string) {
    setTestingId(id);
    const res = await fetch(`/api/email-accounts/${id}/test`, { method: "POST" });
    setTestingId(null);
    const data = await res.json();
    if (data.smtp?.ok === false) {
      toast.error(`SMTP failed: ${data.smtp.error}`);
    } else {
      toast.success("SMTP verified");
    }
    if (data.imap !== null && data.imap !== undefined) {
      if (data.imap?.ok === false) {
        toast.error(`IMAP failed: ${data.imap.error}`);
      } else {
        toast.success("IMAP verified");
      }
    }
    if (data.ok) refresh();
  }

  async function deleteAccount(id: string) {
    if (!confirm("Delete this email account?")) return;
    await fetch(`/api/email-accounts/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      setPage((p) => Math.min(p, Math.max(1, Math.ceil(next.length / PAGE_SIZE))));
      return next;
    });
  }

  async function togglePause(a: EmailAccount) {
    const paused = !a.paused_at;
    const res = await fetch(`/api/email-accounts/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused }),
    });
    if (!res.ok) { toast.error("Could not update account"); return; }
    setAccounts((prev) => prev.map((x) => x.id === a.id ? { ...x, paused_at: paused ? new Date().toISOString() : null, paused_reason: paused ? "Manually paused" : null } : x));
    toast.success(paused ? "Sender deactivated — it won't send until reactivated" : "Sender reactivated");
  }

  return (
    <div>
      <div className="bg-base-200 border border-[var(--border-subtle)] rounded-2xl p-4 mb-5 text-xs text-base-content/60 leading-relaxed">
        <span className="font-medium text-base-content/80">Gmail app-password connection</span>{" "}
        verifies sending and inbox access before saving. Google requires 2-Step Verification before you can create an app password.
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-base-content/50">Email accounts for outreach and inbox sync</p>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-base-100 text-base-content/70 hover:bg-base-200 transition-colors"
            onClick={openCreate}
          >
            <RiAddLine size={14} /> Other SMTP
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
            onClick={openGmailConnect}
          >
            <RiShieldKeyholeLine size={14} /> Connect Gmail
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-12 text-base-content/30 text-sm border border-dashed border-[var(--border)] rounded-2xl">
          No email accounts yet. Add one to start sending emails.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pageAccounts.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-4 py-3 bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] hover:border-[var(--border)] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-base-200 flex items-center justify-center text-sm font-bold text-base-content/60 shrink-0">
                {a.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-base-content/40 truncate">
                  {a.from_email} · {a.provider === "gmail_app_password" ? "Gmail app password" : `${a.smtp_host}:${a.smtp_port}`} · {a.daily_email_limit}/day
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.provider === "gmail_app_password" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary">
                    Gmail
                  </span>
                )}
                {a.is_verified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success/15 text-success">
                    <RiCheckLine size={10} /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-base-200 text-base-content/50">
                    <RiCloseLine size={10} /> Unverified
                  </span>
                )}
                {a.paused_at ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-base-content/10 text-base-content/60" title={a.paused_reason ?? "Deactivated"}>
                    <RiPauseLine size={10} /> Deactivated
                  </span>
                ) : a.active_run_count > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning/15 text-warning">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> In use
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-base-200 text-base-content/40">
                    Free
                  </span>
                )}
                <button
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${a.paused_at ? "bg-success/10 text-success border-success/20 hover:bg-success/20" : "border-[var(--border)] text-base-content/60 hover:bg-base-200"}`}
                  onClick={() => togglePause(a)}
                  title={a.paused_at ? "Reactivate — allow this sender to send again" : "Deactivate — stop this sender from sending (stays connected)"}
                >
                  {a.paused_at ? <><RiPlayLine size={12} /> Activate</> : <><RiPauseLine size={12} /> Deactivate</>}
                </button>
                <button
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
                  onClick={() => testConnection(a.id)}
                  disabled={testingId === a.id}
                >
                  {testingId === a.id ? <span className="loading loading-spinner loading-xs" /> : <RiShieldCheckLine size={12} />}
                  Test
                </button>
                {/* 👈 WARMUP BUTTON ADDED HERE */}
                <button
                  type="button"
                  onClick={() => setSelectedWarmupAccountId(a.id)}
                  title="Configure Warmup"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${a.warmup?.enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                      : "border-[var(--border-subtle)] bg-base-100 text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    }`}
                >
                  <RiFireLine
                    size={14}
                    className={a.warmup?.enabled ? "text-emerald-500" : "text-base-content/60"}
                  />
                  <span>Warmup</span>
                  {a.warmup?.enabled && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </button>
                <button
                  className="inline-flex items-center p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
                  onClick={() => openEdit(a)}
                >
                  <RiEditLine size={14} />
                </button>
                <button
                  className="inline-flex items-center p-1.5 rounded-lg bg-error/10 text-error border border-error/20 hover:bg-error/20 transition-colors"
                  onClick={() => deleteAccount(a.id)}
                >
                  <RiDeleteBinLine size={13} />
                </button>
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-[var(--border-subtle)]">
              <span className="text-xs text-base-content/40">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, accounts.length)} of {accounts.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 rounded-md text-xs text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ←
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-6 h-6 rounded-md text-xs font-medium transition-colors ${n === page ? "bg-primary text-primary-content" : "text-base-content/40 hover:text-base-content hover:bg-base-200"}`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2.5 py-1 rounded-md text-xs text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showGmailModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-modal)] max-w-lg">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <RiShieldKeyholeLine size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-base">Connect Gmail with an app password</h3>
                <p className="text-xs text-base-content/50 mt-1">Outbount will verify Gmail sending and inbox access before storing the encrypted credential.</p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-base-200 p-3 mb-4 text-xs text-base-content/60 leading-relaxed">
              <ol className="list-decimal ml-4 space-y-1">
                <li>Turn on 2-Step Verification for your Google account.</li>
                <li>
                  Open{" "}
                  <a className="text-primary hover:underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                    Google App Passwords
                  </a>
                  {" "}and create one for Outbount.
                </li>
                <li>Paste the 16-character password below. Spaces are accepted.</li>
              </ol>
            </div>

            <form onSubmit={connectGmail} className="flex flex-col gap-3">
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Google account email</label>
                <input
                  type="email"
                  autoComplete="username"
                  className="input input-bordered input-sm w-full"
                  placeholder="you@gmail.com"
                  value={gmailForm.email}
                  onChange={(e) => setGmailForm({ ...gmailForm, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label text-xs text-base-content/50 pb-1">16-character app password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="input input-bordered input-sm w-full font-mono tracking-wider"
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={gmailForm.app_password}
                  onChange={(e) => setGmailForm({ ...gmailForm, app_password: e.target.value })}
                  required
                />
                <p className="text-[11px] text-base-content/35 mt-1">Use the generated app password, not your regular Google password.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Sender name <span className="text-base-content/30">(optional)</span></label>
                  <input
                    className="input input-bordered input-sm w-full"
                    placeholder="Your Name"
                    value={gmailForm.from_name}
                    onChange={(e) => setGmailForm({ ...gmailForm, from_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Connection name <span className="text-base-content/30">(optional)</span></label>
                  <input
                    className="input input-bordered input-sm w-full"
                    placeholder="Gmail outreach"
                    value={gmailForm.name}
                    onChange={(e) => setGmailForm({ ...gmailForm, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Emails / day</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    className="input input-bordered input-sm w-full"
                    value={gmailForm.daily_email_limit}
                    onChange={(e) => setGmailForm({ ...gmailForm, daily_email_limit: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Timezone</label>
                  <select
                    className="select select-sm w-full"
                    value={gmailForm.timezone}
                    onChange={(e) => setGmailForm({ ...gmailForm, timezone: e.target.value })}
                  >
                    {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="modal-action mt-3">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowGmailModal(false)} disabled={gmailLoading}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={gmailLoading}>
                  {gmailLoading ? <span className="loading loading-spinner loading-xs" /> : <RiShieldCheckLine size={14} />}
                  {gmailLoading ? "Verifying Gmail…" : "Connect and verify"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-modal)] max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-base mb-4">{editingAccount ? "Edit Email Account" : "Add Email Account"}</h3>
            <form onSubmit={save} className="flex flex-col gap-3">

              {/* Preset — only for create */}
              {!editingAccount && (
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Provider preset</label>
                  <div className="flex gap-2">
                    {[["outlook", "Outlook / Hotmail"], ["custom", "Custom SMTP"]].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => applyPreset(key)}
                        className={`px-3 py-1.5 rounded-[10px] text-xs font-medium border transition-colors ${form.preset === key ? "bg-primary/10 text-primary border-primary/30" : "bg-base-100 text-base-content/60 border-[var(--border)] hover:bg-base-200"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Display name</label>
                  <input className="input input-bordered input-sm w-full" placeholder="My Gmail" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">From name (optional)</label>
                  <input className="input input-bordered input-sm w-full" placeholder="Your Name" value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">From email address</label>
                  <input type="email" className="input input-bordered input-sm w-full" placeholder="you@gmail.com" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} required />
                </div>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Reply-To (optional)</label>
                  <input type="email" className="input input-bordered input-sm w-full" placeholder="you@example.com" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} />
                </div>
              </div>

              <div className="border-t border-[var(--border-subtle)] pt-3">
                <p className="text-xs font-medium text-base-content/50 mb-2 uppercase tracking-wide">SMTP (sending)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="label text-xs text-base-content/50 pb-1">Host</label>
                    <input className="input input-bordered input-sm w-full font-mono text-xs" placeholder="smtp.gmail.com" value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} required />
                  </div>
                  <div>
                    <label className="label text-xs text-base-content/50 pb-1">Port</label>
                    <input type="number" className="input input-bordered input-sm w-full" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 mb-3">
                  <input type="checkbox" className="checkbox checkbox-xs" checked={form.smtp_secure === 1} onChange={(e) => setForm({ ...form, smtp_secure: e.target.checked ? 1 : 0 })} id="smtp_secure" />
                  <label htmlFor="smtp_secure" className="text-xs text-base-content/60">Use SSL (port 465). Leave unchecked for STARTTLS (port 587).</label>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-base-content/50 uppercase tracking-wide">Credentials</p>
                  <button
                    type="button"
                    onClick={() => setSmtpUnlocked((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
                  >
                    {smtpUnlocked ? <RiLockUnlockLine size={12} /> : <RiLockLine size={12} />}
                    {smtpUnlocked ? "Lock" : "Unlock to edit"}
                  </button>
                </div>
                {!smtpUnlocked ? (
                  <div className="px-3 py-2.5 rounded-lg bg-base-200 border border-[var(--border-subtle)] text-xs text-base-content/40">
                    {form.username
                      ? <span><span className="text-base-content/60 font-mono">{form.username}</span> · password kept</span>
                      : "Unlock to set username and password"}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Username / Email</label>
                      <input
                        autoComplete="new-password"
                        className="input input-bordered input-sm w-full"
                        placeholder="you@gmail.com"
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">
                        {editingAccount ? "New password (blank = keep)" : "App password"}
                      </label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="input input-bordered input-sm w-full"
                        placeholder={editingAccount ? "•••••••• (unchanged)" : "xxxx xxxx xxxx xxxx"}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        required={!editingAccount}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border-subtle)] pt-3">
                <p className="text-xs font-medium text-base-content/50 mb-2 uppercase tracking-wide">IMAP (inbox reading — optional)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="label text-xs text-base-content/50 pb-1">Host</label>
                    <input className="input input-bordered input-sm w-full font-mono text-xs" placeholder="imap.gmail.com" value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} />
                  </div>
                  <div>
                    <label className="label text-xs text-base-content/50 pb-1">Port</label>
                    <input type="number" className="input input-bordered input-sm w-full" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="flex items-center justify-between mb-2 mt-3">
                  <p className="text-xs font-medium text-base-content/50 uppercase tracking-wide">Credentials</p>
                  <button
                    type="button"
                    onClick={() => setImapUnlocked((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
                  >
                    {imapUnlocked ? <RiLockUnlockLine size={12} /> : <RiLockLine size={12} />}
                    {imapUnlocked ? "Lock" : "Unlock to edit"}
                  </button>
                </div>
                {!imapUnlocked ? (
                  <div className="px-3 py-2.5 rounded-lg bg-base-200 border border-[var(--border-subtle)] text-xs text-base-content/40">
                    {form.imap_username
                      ? <span><span className="text-base-content/60 font-mono">{form.imap_username}</span> · password kept</span>
                      : <span>Uses SMTP credentials · password kept</span>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">IMAP username <span className="text-base-content/30">(blank = same as SMTP)</span></label>
                      <input
                        autoComplete="new-password"
                        className="input input-bordered input-sm w-full font-mono text-xs"
                        placeholder="IMAP username"
                        value={form.imap_username}
                        onChange={(e) => setForm({ ...form, imap_username: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">IMAP password <span className="text-base-content/30">(blank = keep)</span></label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="input input-bordered input-sm w-full"
                        placeholder="•••••••• (unchanged)"
                        value={form.imap_password}
                        onChange={(e) => setForm({ ...form, imap_password: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border-subtle)] pt-3 flex flex-col gap-3">
                <p className="text-xs font-medium text-base-content/50 uppercase tracking-wide">Limits &amp; Schedule</p>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Emails / day</label>
                  <input type="number" className="input input-bordered input-sm w-full" value={form.daily_email_limit} onChange={(e) => setForm({ ...form, daily_email_limit: Number(e.target.value) })} min={1} max={500} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs text-base-content/50 pb-1">Start</label>
                    <select className="select select-sm w-full" value={form.active_hours_start} onChange={(e) => setForm({ ...form, active_hours_start: Number(e.target.value) })}>
                      {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs text-base-content/50 pb-1">End</label>
                    <select className="select select-sm w-full" value={form.active_hours_end} onChange={(e) => setForm({ ...form, active_hours_end: Number(e.target.value) })}>
                      {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  </div>
                </div>
                {form.active_hours_start >= form.active_hours_end
                  ? <p className="text-xs text-error">Start must be before end</p>
                  : <p className="text-xs text-base-content/40">{fmtHour(form.active_hours_start)} – {fmtHour(form.active_hours_end)} ({form.active_hours_end - form.active_hours_start}h window)</p>
                }
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Timezone</label>
                  <select className="select select-sm w-full" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                    {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs text-base-content/50 pb-1">Working days</label>
                  <div className="flex gap-1.5">
                    {WEEKDAYS.map(day => {
                      const active = form.working_days.split(",").map(Number).includes(day.iso);
                      return (
                        <button
                          key={day.iso}
                          type="button"
                          onClick={() => {
                            const days = active
                              ? form.working_days.split(",").map(Number).filter(d => d !== day.iso)
                              : [...form.working_days.split(",").map(Number), day.iso].sort((a, b) => a - b);
                            setForm({ ...form, working_days: days.join(",") });
                          }}
                          className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ${active
                            ? "bg-primary/15 text-primary border-primary/40"
                            : "bg-base-100 text-base-content/50 border-[var(--border)] hover:bg-base-200"
                            }`}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border-subtle)] pt-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-base-content/50 uppercase tracking-wide">Sending ramp-up</p>
                    <p className="text-xs text-base-content/35 mt-0.5">Start low, increase +2/day until target volume</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, ramp_up_enabled: !f.ramp_up_enabled }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.ramp_up_enabled ? "bg-primary" : "bg-base-300"} border border-[var(--border-subtle)]`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.ramp_up_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {form.ramp_up_enabled && (
                  <>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Ramp start date</label>
                      <input
                        type="date"
                        className="input input-bordered input-sm w-full"
                        value={form.ramp_start_date}
                        onChange={(e) => setForm(f => ({ ...f, ramp_start_date: e.target.value }))}
                      />
                    </div>
                    <RampDiagram startDate={form.ramp_start_date} target={form.daily_email_limit} />
                  </>
                )}
              </div>

              <div className="border-t border-[var(--border-subtle)] pt-3">
                <p className="text-xs font-medium text-base-content/50 mb-1 uppercase tracking-wide">Signature</p>
                <p className="text-xs text-base-content/35 mb-2">
                  Appended to outgoing emails. If empty, nothing is added — no separator line, nothing.
                </p>
                <textarea
                  className="textarea textarea-bordered w-full text-sm h-24 resize-none font-mono"
                  placeholder={"John Smith\nHead of Sales · Acme Corp\njohn@acme.com"}
                  value={form.signature}
                  onChange={(e) => setForm({ ...form, signature: e.target.value })}
                />
              </div>

              <div className="modal-action mt-1">
                <button type="button" className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" onClick={() => { setShowModal(false); setEditingAccount(null); setSmtpUnlocked(false); setImapUnlocked(false); }}>
                  Cancel
                </button>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={loading}>
                  {loading ? <span className="loading loading-spinner loading-xs" /> : editingAccount ? "Save changes" : <><RiMailLine size={14} /> Add Account</>}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => { setShowModal(false); setEditingAccount(null); setSmtpUnlocked(false); setImapUnlocked(false); }} />
        </div>
      )}
      <WarmupSettingsModal
        key={selectedWarmupAccountId || ""}
        emailAccountId={selectedWarmupAccountId || ""}
        isOpen={!!selectedWarmupAccountId}
        onClose={(saved) => { setSelectedWarmupAccountId(null); if (saved) refresh(); }}
        initialSettings={(() => {
          const w = accounts.find((a) => a.id === selectedWarmupAccountId)?.warmup;
          if (!w) return undefined;
          return {
            enabled: w.enabled,
            maxDailyTarget: w.max_target,
            rampIncrement: w.ramp_increment,
            startVolume: w.start_volume,
            replyRate: w.reply_rate,
            aiContentEnabled: w.ai_content_enabled,
            pool_id: w.pool_id,
            timezone: w.timezone,
            active_hours_start: w.active_hours_start,
            active_hours_end: w.active_hours_end,
            send_jitter_min: w.send_jitter_min,
            send_jitter_max: w.send_jitter_max,
            ramp_type: w.ramp_type,
            custom_ramp_caps: w.custom_ramp_caps,
            ai_provider: w.ai_provider,
            ai_prompt_template: w.ai_prompt_template,
            paused_reason: w.paused_reason,
          };
        })()}
        availablePools={availablePools}
      />
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: "", body: "" });
  const [loading, setLoading] = useState(false);
  const [customFields, setCustomFields] = useState<{ key: string }[]>([]);
  useEffect(() => {
    fetch("/api/platform/custom-fields")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d)) setCustomFields(d); })
      .catch(() => { });
  }, []);
  const variableChips = buildVarChips(customFields);

  async function refresh() {
    const res = await fetch("/api/templates");
    setTemplates(await res.json());
  }

  function openCreate() { setEditing(null); setForm({ name: "", body: "" }); setShowModal(true); }
  function openEdit(t: Template) { setEditing(t); setForm({ name: t.name, body: t.body }); setShowModal(true); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const url = editing ? `/api/templates/${editing.id}` : "/api/templates";
    const res = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) { toast.error("Failed to save"); return; }
    toast.success(editing ? "Updated" : "Created");
    setShowModal(false);
    refresh();
  }

  async function del(id: number) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-base-content/50">
          Use <code className="text-primary text-xs">{"{{first_name}}"}</code>, <code className="text-primary text-xs">{"{{company}}"}</code> as variables
        </p>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors" onClick={openCreate}>
          <RiAddLine size={14} /> New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-base-content/30 text-sm border border-dashed border-[var(--border)] rounded-2xl">No templates yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-start gap-4 px-4 py-3 bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] hover:border-[var(--border)] transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-base-content/40 mt-0.5 line-clamp-2 whitespace-pre-wrap">{t.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="inline-flex items-center p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors" onClick={() => openEdit(t)}>
                  <RiEditLine size={14} />
                </button>
                <button className="inline-flex items-center p-1.5 rounded-lg bg-error/10 text-error border border-error/20 hover:bg-error/20 transition-colors" onClick={() => del(t.id)}>
                  <RiDeleteBinLine size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-modal)] max-w-lg">
            <h3 className="font-semibold text-base mb-4">{editing ? "Edit Template" : "New Template"}</h3>
            <form onSubmit={save} className="flex flex-col gap-3">
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Template name</label>
                <input className="input input-bordered input-sm w-full" placeholder="e.g. Connection note" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Body</label>
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-xs text-base-content/40">Insert:</span>
                  {variableChips.map((c) => (
                    <button key={c.token} type="button" title={c.custom ? "Custom field" : undefined}
                      onClick={() => {
                        const el = document.getElementById("tmpl-body") as HTMLTextAreaElement | null;
                        const pos = el?.selectionStart ?? form.body.length;
                        setForm((f) => ({ ...f, body: f.body.slice(0, pos) + c.token + f.body.slice(pos) }));
                        setTimeout(() => { el?.focus(); el?.setSelectionRange(pos + c.token.length, pos + c.token.length); }, 0);
                      }}
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-base-200 text-base-content/70 hover:bg-base-300 transition-colors font-mono">
                      {c.label}{c.custom && <span className="w-1 h-1 rounded-full bg-base-content/40" />}
                    </button>
                  ))}
                </div>
                <textarea id="tmpl-body" className="textarea textarea-bordered w-full text-sm font-mono" rows={6} placeholder="Hi {{first_name}}, I noticed you're at {{company}}..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
              </div>
              <div className="modal-action mt-1">
                <button type="button" className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={loading}>
                  {loading ? <span className="loading loading-spinner loading-xs" /> : "Save"}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setShowModal(false)} />
        </div>
      )}
    </div>
  );
}


// ─── Types & Definitions ──────────────────────────────────────────────────────

interface SavedIntegration {
  id: string;             // e.g., "apollo_1723049200"
  key: string;            // e.g., "apollo"
  updated_at: string;
  api_key_masked: string | null;
  configured: boolean;
}

interface IntegrationDef {
  key: string;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  accentColor: string;
  placeholder: string;
}

export interface CustomProvider {
  id: string;
  name: string;
  base_url: string;
  api_key_masked: string | null;
  has_key: boolean;
  default_model: string | null;
  models: { id: string; name: string }[];
  provider_type: string;
  created_at: string;
  updated_at: string;
}

interface ProviderForm {
  name: string;
  base_url: string;
  api_key: string;
  default_model: string;
  models_cache: { id: string; name: string }[];
  provider_type: string;
}

const BLANK_PROVIDER_FORM: ProviderForm = {
  name: "",
  base_url: "",
  api_key: "",
  default_model: "",
  models_cache: [],
  provider_type: "custom",
};

const PROVIDER_PRESETS: {
  label: string;
  name: string;
  base_url: string;
  placeholder: string;
  badge: string;
  description: string;
  default_model?: string;
}[] = [
  {
    label: "OpenRouter",
    name: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    placeholder: "sk-or-...",
    badge: "OR",
    description: "Route requests across Claude 3.5, GPT-4o, Llama 3, and 200+ models",
    default_model: "anthropic/claude-3.5-sonnet",
  },
  {
    label: "OpenAI",
    name: "OpenAI",
    base_url: "https://api.openai.com/v1",
    placeholder: "sk-proj-...",
    badge: "OAI",
    description: "Official OpenAI models (GPT-4o, GPT-4o-mini, o1-mini)",
    default_model: "gpt-4o-mini",
  },
  {
    label: "Groq",
    name: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    placeholder: "gsk_...",
    badge: "GQ",
    description: "Ultra-fast LPU inference (Llama 3.3 70B, DeepSeek R1, Mixtral)",
    default_model: "llama-3.3-70b-versatile",
  },
  {
    label: "DeepSeek",
    name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    placeholder: "sk-...",
    badge: "DS",
    description: "DeepSeek V3 and DeepSeek R1 reasoning models",
    default_model: "deepseek-chat",
  },
  {
    label: "Mistral",
    name: "Mistral AI",
    base_url: "https://api.mistral.ai/v1",
    placeholder: "Your Mistral API key",
    badge: "MS",
    description: "Mistral Large, Codestral, and Pixtral",
    default_model: "mistral-large-latest",
  },
  {
    label: "Gemini",
    name: "Google Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    placeholder: "AIzaSy...",
    badge: "GM",
    description: "Gemini 1.5 Pro and Flash via OpenAI-compatible endpoint",
    default_model: "gemini-1.5-flash",
  },
  {
    label: "Together",
    name: "Together AI",
    base_url: "https://api.together.xyz/v1",
    placeholder: "Your Together API key",
    badge: "TG",
    description: "Open source models on high-performance cloud clusters",
  },
  {
    label: "Ollama",
    name: "Ollama (Local LLM)",
    base_url: "http://localhost:11434/v1",
    placeholder: "Leave blank for Ollama (no key required)",
    badge: "OL",
    description: "Run private local models (Llama 3, Mistral, Qwen) on your machine",
    default_model: "llama3",
  },
];

const DATA_INTEGRATIONS: IntegrationDef[] = [
  {
    key: "apollo",
    name: "Apollo.io",
    description: "Lead enrichment, email reveal & seniority data",
    badge: "Ap",
    badgeColor: "#2A251E",
    accentColor: "#2A251E",
    placeholder: "Apollo API key",
  },
  {
    key: "millionverifier",
    name: "MillionVerifier",
    description: "Email verification service for bulk lead validation",
    badge: "MV",
    badgeColor: "#2A251E",
    accentColor: "#2A251E",
    placeholder: "MillionVerifier API key",
  },
  {
    key: "zerobounce",
    name: "ZeroBounce",
    description: "Email verification service with spam trap detection",
    badge: "ZB",
    badgeColor: "#2A251E",
    accentColor: "#2A251E",
    placeholder: "ZeroBounce API key",
  },
  {
    key: "debounce",
    name: "DeBounce",
    description: "Fast email validation service",
    badge: "DB",
    badgeColor: "#2A251E",
    accentColor: "#2A251E",
    placeholder: "DeBounce API key",
  },
];

// ─── Integrations Tab ─────────────────────────────────────────────────────────

function IntegrationsTab() {
  const [savedIntegrations, setSavedIntegrations] = useState<SavedIntegration[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [inputKeys, setInputKeys] = useState<{ [key: string]: string }>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<CustomProvider | null>(null);
  const [modalForm, setModalForm] = useState<ProviderForm>(BLANK_PROVIDER_FORM);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalModels, setModalModels] = useState<{ id: string; name: string }[] | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);

  // Fetch saved data
  const fetchIntegrations = async () => {
    try {
      const res = await fetch("/api/integrations");
      if (res.ok) setSavedIntegrations(await res.json());
    } catch (err) {
      console.error("Failed to load integrations", err);
    }
  };

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch("/api/settings/ai-providers");
      if (res.ok) setCustomProviders(await res.json());
    } catch (err) {
      console.error("Failed to load AI providers", err);
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
    fetchProviders();
  }, []);

  // Quick connect a preset
  const handleConnectPreset = async (preset: typeof PROVIDER_PRESETS[0]) => {
    const key = (inputKeys[preset.label] || "").trim();
    if (!key && !preset.base_url.includes("localhost") && !preset.base_url.includes("127.0.0.1")) {
      toast.error(`Enter an API key for ${preset.name}`);
      return;
    }

    setSavingKey(preset.label);
    try {
      const res = await fetch("/api/settings/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preset.name,
          base_url: preset.base_url,
          api_key: key || undefined,
          default_model: preset.default_model || undefined,
          provider_type: preset.label.toLowerCase(),
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Failed to connect ${preset.name}`);
        return;
      }

      // Also sync OpenRouter into integrations table if it was OpenRouter
      if (preset.label === "OpenRouter" && key) {
        await fetch("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "openrouter", api_key: key }),
        }).catch(() => {});
        fetchIntegrations();
      }

      toast.success(`${preset.name} connected successfully!`);
      setInputKeys((prev) => ({ ...prev, [preset.label]: "" }));
      await fetchProviders();
    } catch {
      toast.error("Network error connecting provider");
    } finally {
      setSavingKey(null);
    }
  };

  // Set default model on provider
  const handleSetDefaultModel = async (providerId: string, modelId: string) => {
    const prov = customProviders.find((p) => p.id === providerId);
    if (!prov) return;
    try {
      const res = await fetch(`/api/settings/ai-providers/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prov.name,
          base_url: prov.base_url,
          default_model: modelId,
        }),
      });
      if (res.ok) {
        toast.success(`Default model set to ${modelId}`);
        fetchProviders();
      } else {
        toast.error("Failed to update default model");
      }
    } catch {
      toast.error("Network error updating default model");
    }
  };

  // Refresh models live
  const handleRefreshModels = async (providerId: string) => {
    setRefreshingId(providerId);
    try {
      const res = await fetch("/api/settings/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, save_models: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(`Loaded ${data.models?.length ?? 0} models!`);
        fetchProviders();
      } else {
        toast.error(data.error || "Failed to load models");
      }
    } catch {
      toast.error("Network error refreshing models");
    } finally {
      setRefreshingId(null);
    }
  };

  // Delete / Disconnect provider
  const handleDeleteProvider = async (providerId: string, name: string) => {
    if (!confirm(`Disconnect ${name}? Campaigns using this provider will fall back to workspace default.`)) return;
    try {
      const res = await fetch(`/api/settings/ai-providers/${providerId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`${name} disconnected`);
        fetchProviders();
      } else {
        toast.error("Failed to disconnect");
      }
    } catch {
      toast.error("Error disconnecting provider");
    }
  };

  // Save non-AI key (Apollo, verifiers)
  const handleSaveDataKey = async (providerKey: string) => {
    const apiKey = inputKeys[providerKey];
    if (!apiKey) return;

    setSavingKey(providerKey);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: providerKey, api_key: apiKey }),
      });

      const data = await res.json();
      if (res.ok) {
        setInputKeys((prev) => ({ ...prev, [providerKey]: "" }));
        toast.success("Integration saved");
        await fetchIntegrations();
      } else {
        toast.error(data.error || "Failed to save key");
      }
    } catch {
      toast.error("Network error saving key");
    } finally {
      setSavingKey(null);
    }
  };

  // Delete non-AI key
  const handleDeleteDataKey = async (id: string) => {
    try {
      const res = await fetch(`/api/integrations?key=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Key removed");
        await fetchIntegrations();
      } else {
        toast.error("Failed to delete key");
      }
    } catch {
      toast.error("Error deleting key");
    }
  };

  // Open modal for custom provider
  const openModal = (p?: CustomProvider) => {
    if (p) {
      setEditingProvider(p);
      setModalForm({
        name: p.name,
        base_url: p.base_url,
        api_key: "",
        default_model: p.default_model || "",
        models_cache: p.models || [],
        provider_type: p.provider_type || "custom",
      });
      setModalModels(p.models || null);
    } else {
      setEditingProvider(null);
      setModalForm(BLANK_PROVIDER_FORM);
      setModalModels(null);
    }
    setModalError(null);
    setShowAddModal(true);
  };

  const testModalConnection = async () => {
    if (!modalForm.base_url.trim()) { toast.error("Enter a base URL first"); return; }
    setModalTesting(true);
    setModalModels(null);
    setModalError(null);
    try {
      const res = await fetch("/api/settings/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: modalForm.base_url,
          api_key: modalForm.api_key || undefined,
          provider_id: editingProvider?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Test failed");
      } else {
        setModalModels(data.models || []);
        if (data.models?.length && !modalForm.default_model) {
          setModalForm((f) => ({ ...f, default_model: data.models[0].id }));
        }
      }
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : "Network error");
    } finally {
      setModalTesting(false);
    }
  };

  const saveModalProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.name.trim()) { toast.error("Name is required"); return; }
    if (!modalForm.base_url.trim()) { toast.error("Base URL is required"); return; }

    setModalSaving(true);
    try {
      const url = editingProvider
        ? `/api/settings/ai-providers/${editingProvider.id}`
        : "/api/settings/ai-providers";
      const method = editingProvider ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modalForm.name,
          base_url: modalForm.base_url,
          api_key: modalForm.api_key || undefined,
          default_model: modalForm.default_model || undefined,
          models_cache: modalModels || modalForm.models_cache,
          provider_type: modalForm.provider_type,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to save provider");
        return;
      }

      toast.success(editingProvider ? "Provider updated" : "Provider added");
      setShowAddModal(false);
      fetchProviders();
    } finally {
      setModalSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* ── SECTION 1: AI & LLM PROVIDERS ── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <RiRobot2Line size={18} className="text-primary" />
              <h3 className="font-semibold text-base text-neutral-900 dark:text-white">AI & LLM Providers</h3>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Connect multiple AI engines (OpenRouter, OpenAI, Groq, DeepSeek, etc.) to power warmup campaigns, email writing, and LinkedIn messaging. Configure and select models from any provider.
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity shrink-0"
          >
            <RiAddLine size={14} /> Add Custom Endpoint
          </button>
        </div>

        {loadingProviders ? (
          <div className="flex items-center gap-2 text-xs text-neutral-400 py-6">
            <RiLoader4Line size={14} className="animate-spin" /> Loading AI providers…
          </div>
        ) : (
          <div className="space-y-3">
            {/* 1. Show all currently connected custom AI providers */}
            {customProviders.map((p) => {
              const modelCount = p.models?.length ?? 0;
              return (
                <div
                  key={p.id}
                  className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 rounded-xl p-4 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs bg-primary/10 text-primary border border-primary/20 shrink-0">
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm text-neutral-900 dark:text-white">{p.name}</h4>
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                            ✓ Connected
                          </span>
                          {modelCount > 0 && (
                            <span className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 rounded-full font-mono">
                              {modelCount} model{modelCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 font-mono mt-0.5 truncate max-w-md">{p.base_url}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleRefreshModels(p.id)}
                        disabled={refreshingId === p.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                        title="Fetch available models from this API key"
                      >
                        <RiRefreshLine size={13} className={refreshingId === p.id ? "animate-spin" : ""} />
                        {refreshingId === p.id ? "Fetching…" : "Refresh Models"}
                      </button>
                      <button
                        onClick={() => openModal(p)}
                        className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                        title="Edit Provider"
                      >
                        <RiEditLine size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteProvider(p.id, p.name)}
                        className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Disconnect"
                      >
                        <RiDeleteBinLine size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Model Selection & Configuration Bar */}
                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-950/40 -mx-4 -mb-4 p-3 rounded-b-xl">
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 shrink-0">
                        Default Model:
                      </span>
                      {modelCount > 0 ? (
                        <select
                          className="select select-bordered select-xs text-xs font-mono bg-white dark:bg-neutral-900 max-w-sm"
                          value={p.default_model || ""}
                          onChange={(e) => handleSetDefaultModel(p.id, e.target.value)}
                        >
                          <option value="">Select a default model…</option>
                          {p.models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.id}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">
                          No models cached yet. Click &quot;Refresh Models&quot; to load models from this provider.
                        </span>
                      )}
                    </div>
                    {p.api_key_masked && (
                      <span className="text-[11px] font-mono text-neutral-400">
                        Key: {p.api_key_masked}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 2. Show popular presets that are not yet connected */}
            {PROVIDER_PRESETS.filter(
              (preset) => !customProviders.some((cp) => cp.name.toLowerCase() === preset.name.toLowerCase() || cp.base_url.replace(/\/$/, "") === preset.base_url.replace(/\/$/, ""))
            ).map((preset) => (
              <div
                key={preset.label}
                className="border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/20 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
                      {preset.badge}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">{preset.name}</h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{preset.description}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder={preset.placeholder}
                    value={inputKeys[preset.label] || ""}
                    onChange={(e) => setInputKeys((prev) => ({ ...prev, [preset.label]: e.target.value }))}
                    className="flex-1 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <button
                    onClick={() => handleConnectPreset(preset)}
                    disabled={savingKey === preset.label}
                    className="btn btn-sm btn-primary text-xs shrink-0"
                  >
                    {savingKey === preset.label ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      "Connect & Load Models"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 2: DATA & EMAIL VERIFIERS ── */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <RiPlugLine size={18} className="text-neutral-500" />
            <h3 className="font-semibold text-base text-neutral-900 dark:text-white">Lead Enrichment & Verification</h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Connect Apollo.io for waterfall lead contact enrichment and verification services for bounce rate suppression.
          </p>
        </div>

        <div className="space-y-4">
          {DATA_INTEGRATIONS.map((def) => {
            const matchingKeys = savedIntegrations.filter((item) => item.key === def.key);
            const isConnected = matchingKeys.length > 0;

            return (
              <div
                key={def.key}
                className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700">
                      {def.badge}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
                        {def.name}
                        {isConnected && (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-normal">
                            ✓ Connected ({matchingKeys.length})
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{def.description}</p>
                    </div>
                  </div>
                </div>

                {matchingKeys.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {matchingKeys.map((saved, idx) => (
                      <div
                        key={saved.id}
                        className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-500 dark:text-neutral-400">Key #{idx + 1}:</span>
                          <span className="font-mono text-neutral-800 dark:text-neutral-200">{saved.api_key_masked}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteDataKey(saved.id)}
                          className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 font-medium transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder={`Add ${def.name} API key...`}
                    value={inputKeys[def.key] || ""}
                    onChange={(e) => setInputKeys((prev) => ({ ...prev, [def.key]: e.target.value }))}
                    className="flex-1 text-xs bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <button
                    onClick={() => handleSaveDataKey(def.key)}
                    disabled={savingKey === def.key || !inputKeys[def.key]}
                    className="btn btn-sm btn-primary text-xs"
                  >
                    {savingKey === def.key ? "Saving..." : "Add Key"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Add / Edit Custom Provider Modal ── */}
      {showAddModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-modal)] max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-base mb-1">
              {editingProvider ? "Edit AI Provider" : "Add Custom AI Provider"}
            </h3>
            <p className="text-xs text-base-content/50 mb-4">
              Connect any OpenAI-compatible API endpoint — cloud or local. Outbount will fetch available models automatically.
            </p>

            {/* Presets */}
            {!editingProvider && (
              <div className="mb-4">
                <p className="text-xs text-base-content/50 mb-2">Quick presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setModalForm((f) => ({
                          ...f,
                          name: preset.name,
                          base_url: preset.base_url,
                          default_model: preset.default_model || "",
                        }))
                      }
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--border)] bg-base-200/60 text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={saveModalProvider} className="flex flex-col gap-3">
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Provider name</label>
                <input
                  className="input input-bordered input-sm w-full"
                  placeholder="e.g. Groq — Fast Inference"
                  value={modalForm.name}
                  onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label text-xs text-base-content/50 pb-1">API Base URL</label>
                <input
                  type="url"
                  className="input input-bordered input-sm w-full font-mono text-xs"
                  placeholder="https://api.groq.com/openai/v1"
                  value={modalForm.base_url}
                  onChange={(e) => {
                    setModalForm({ ...modalForm, base_url: e.target.value });
                    setModalModels(null);
                    setModalError(null);
                  }}
                  required
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="label text-xs text-base-content/50 pb-1">
                  API Key {editingProvider && <span className="text-base-content/30">(leave blank to keep existing)</span>}
                </label>
                <input
                  type="password"
                  className="input input-bordered input-sm w-full font-mono text-xs"
                  placeholder={editingProvider ? "•••••••• (unchanged)" : "sk-..."}
                  value={modalForm.api_key}
                  onChange={(e) => setModalForm({ ...modalForm, api_key: e.target.value })}
                  autoComplete="new-password"
                  spellCheck={false}
                />
              </div>

              {/* Test Connection / Fetch Models */}
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={testModalConnection}
                    disabled={modalTesting || !modalForm.base_url.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-base-200/60 hover:bg-base-200 transition-colors disabled:opacity-50"
                  >
                    {modalTesting ? <span className="loading loading-spinner loading-xs" /> : <RiShieldCheckLine size={13} />}
                    {modalTesting ? "Fetching models…" : "Test Connection & Fetch Models"}
                  </button>
                  {modalModels !== null && !modalError && (
                    <span className="text-xs text-success font-medium flex items-center gap-1">
                      <RiCheckLine size={13} /> {modalModels.length} model{modalModels.length !== 1 ? "s" : ""} found
                    </span>
                  )}
                  {modalError && <span className="text-xs text-error">{modalError}</span>}
                </div>

                {/* Model dropdown selection */}
                {modalModels && modalModels.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <label className="label text-xs text-base-content/50 pb-0">Default Model</label>
                    <select
                      className="select select-bordered select-sm w-full text-xs font-mono"
                      value={modalForm.default_model}
                      onChange={(e) => setModalForm({ ...modalForm, default_model: e.target.value })}
                    >
                      <option value="">Select a default model…</option>
                      {modalModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="modal-action mt-2">
                <button
                  type="button"
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50"
                  disabled={modalSaving}
                >
                  {modalSaving ? <span className="loading loading-spinner loading-xs" /> : null}
                  {editingProvider ? "Save changes" : "Add Provider"}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setShowAddModal(false)} />
        </div>
      )}
    </div>
  );
}

interface AiConfig {
  default_model: string;
  system_prompt: string;
  user_prompt: string;
  email_examples: string;
  linkedin_examples: string;
  base_url: string;
  api_key: string;
}

const BLANK_AI_CONFIG: AiConfig = { default_model: "", system_prompt: "", user_prompt: "", email_examples: "", linkedin_examples: "", base_url: "", api_key: "" };

// ─── Custom AI Providers Card (Used in AI Tab) ────────────────────────────────
function CustomProvidersCard() {
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(BLANK_PROVIDER_FORM);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  // Test-connection state
  const [testing, setTesting] = useState(false);
  const [testModels, setTestModels] = useState<{ id: string; name: string }[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function loadProviders() {
    setLoading(true);
    try {
      const r = await fetch("/api/settings/ai-providers");
      if (r.ok) setProviders(await r.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProviders(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm(BLANK_PROVIDER_FORM);
    setTestModels(null);
    setTestError(null);
    setShowKey(false);
    setShowModal(true);
  }

  function openEdit(p: CustomProvider) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      base_url: p.base_url,
      api_key: "",
      default_model: p.default_model || "",
      models_cache: p.models || [],
      provider_type: p.provider_type || "custom",
    });
    setTestModels(p.models || null);
    setTestError(null);
    setShowKey(false);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(BLANK_PROVIDER_FORM);
    setTestModels(null);
    setTestError(null);
  }

  async function testConnection() {
    if (!form.base_url.trim()) { toast.error("Enter a base URL first"); return; }
    setTesting(true);
    setTestModels(null);
    setTestError(null);
    try {
      const r = await fetch("/api/settings/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_url: form.base_url, api_key: form.api_key || undefined, provider_id: editingId || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { setTestError(data.error || "Test failed"); return; }
      setTestModels(data.models ?? []);
      if (data.models?.length && !form.default_model) {
        setForm((f) => ({ ...f, default_model: data.models[0].id }));
      }
    } catch (e: unknown) {
      setTestError(e instanceof Error ? e.message : "Network error");
    } finally {
      setTesting(false);
    }
  }

  async function handleRefresh(id: string) {
    setRefreshingId(id);
    try {
      const r = await fetch("/api/settings/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: id, save_models: true }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        toast.success(`Loaded ${d.models?.length ?? 0} models!`);
        loadProviders();
      } else {
        toast.error(d.error || "Failed to load models");
      }
    } catch {
      toast.error("Error refreshing models");
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleSetModel(providerId: string, modelId: string) {
    const prov = providers.find((p) => p.id === providerId);
    if (!prov) return;
    try {
      const res = await fetch(`/api/settings/ai-providers/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prov.name,
          base_url: prov.base_url,
          default_model: modelId,
        }),
      });
      if (res.ok) {
        toast.success(`Default model set to ${modelId}`);
        loadProviders();
      }
    } catch {
      toast.error("Failed to update default model");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.base_url.trim()) { toast.error("Base URL is required"); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/settings/ai-providers/${editingId}` : "/api/settings/ai-providers";
      const method = editingId ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          base_url: form.base_url,
          api_key: form.api_key || undefined,
          default_model: form.default_model || undefined,
          models_cache: testModels || form.models_cache,
          provider_type: form.provider_type,
        }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Failed to save"); return; }
      toast.success(editingId ? "Provider updated" : "Provider added");
      closeModal();
      loadProviders();
    } finally {
      setSaving(false);
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm("Delete this AI provider? Any campaigns using it will fall back to the workspace default.")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/settings/ai-providers/${id}`, { method: "DELETE" });
      if (r.ok) { toast.success("Provider deleted"); loadProviders(); }
      else toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <RiPlugLine size={16} className="text-base-content/50" />
            <h3 className="text-[15px] font-semibold">Custom AI Providers</h3>
          </div>
          <p className="text-[13px] text-base-content/50">
            Add OpenAI-compatible providers (Groq, Together, Ollama, etc.) with custom models and attach them to any campaign.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors shrink-0"
        >
          <RiAddLine size={14} /> Add Provider
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/40 py-4">
          <span className="loading loading-spinner loading-xs" /> Loading…
        </div>
      ) : providers.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl py-8 text-center text-sm text-base-content/30">
          No custom providers yet. Add one to use it in your campaigns.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {providers.map((p) => {
            const count = p.models?.length ?? 0;
            return (
              <div
                key={p.id}
                className="flex flex-col gap-2.5 p-4 bg-base-200/40 border border-[var(--border-subtle)] rounded-xl hover:border-[var(--border)] transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-base-content">{p.name}</p>
                      <p className="text-xs text-base-content/40 font-mono truncate">{p.base_url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${p.has_key ? "bg-success/10 text-success border-success/20" : "bg-base-300 text-base-content/40 border-[var(--border)]"}`}>
                      {p.has_key ? "Key set" : "No key"}
                    </span>
                    {count > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-base-200 text-base-content/60 border border-[var(--border)]">
                        {count} model{count !== 1 ? "s" : ""}
                      </span>
                    )}
                    <button
                      onClick={() => handleRefresh(p.id)}
                      disabled={refreshingId === p.id}
                      className="btn btn-xs btn-ghost text-base-content/50 hover:text-base-content"
                      title="Refresh models"
                    >
                      <RiRefreshLine size={13} className={refreshingId === p.id ? "animate-spin" : ""} />
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      className="btn btn-xs btn-ghost text-base-content/50 hover:text-base-content"
                      title="Edit"
                    >
                      <RiEditLine size={14} />
                    </button>
                    <button
                      onClick={() => deleteProvider(p.id)}
                      disabled={deletingId === p.id}
                      className="btn btn-xs btn-ghost text-base-content/50 hover:text-error"
                      title="Delete"
                    >
                      {deletingId === p.id ? <span className="loading loading-spinner loading-xs" /> : <RiDeleteBinLine size={14} />}
                    </button>
                  </div>
                </div>

                {/* Default model bar */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <span className="text-base-content/50">Default Model:</span>
                    {count > 0 ? (
                      <select
                        className="select select-bordered select-xs font-mono text-[11px] bg-base-100"
                        value={p.default_model || ""}
                        onChange={(e) => handleSetModel(p.id, e.target.value)}
                      >
                        <option value="">Select a model…</option>
                        {p.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-base-content/40 italic">Click refresh to load models</span>
                    )}
                  </div>
                  {p.api_key_masked && <span className="text-[11px] font-mono text-base-content/40">Key: {p.api_key_masked}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-modal)] max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-base mb-1">{editingId ? "Edit AI Provider" : "Add AI Provider"}</h3>
            <p className="text-xs text-base-content/40 mb-4">Any OpenAI-compatible endpoint — cloud or local.</p>

            {/* Presets */}
            <div className="mb-4">
              <p className="text-xs text-base-content/50 mb-2">Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {PROVIDER_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, name: preset.name, base_url: preset.base_url, default_model: preset.default_model || "" }))}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--border)] bg-base-200/60 text-base-content/60 hover:bg-base-200 hover:text-base-content transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={save} className="flex flex-col gap-3">
              <div>
                <label className="label text-xs text-base-content/50 pb-1">Provider name</label>
                <input
                  className="input input-bordered input-sm w-full"
                  placeholder="e.g. Groq — Fast Inference"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label text-xs text-base-content/50 pb-1">API Base URL</label>
                <input
                  type="url"
                  className="input input-bordered input-sm w-full font-mono text-xs"
                  placeholder="https://api.groq.com/openai/v1"
                  value={form.base_url}
                  onChange={(e) => { setForm({ ...form, base_url: e.target.value }); setTestModels(null); setTestError(null); }}
                  required
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="label text-xs text-base-content/50 pb-1">
                  API Key {editingId && <span className="text-base-content/30">(leave blank to keep existing)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    className="input input-bordered input-sm w-full font-mono text-xs pr-14"
                    placeholder={editingId ? "•••••••• (unchanged)" : "sk-..."}
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-base-content/40 hover:text-base-content/70 transition-colors"
                    tabIndex={-1}
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Test Connection */}
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={testing || !form.base_url.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-base-200/60 hover:bg-base-200 transition-colors disabled:opacity-50"
                  >
                    {testing ? <span className="loading loading-spinner loading-xs" /> : <RiShieldCheckLine size={13} />}
                    {testing ? "Testing…" : "Test Connection & Fetch Models"}
                  </button>
                  {testModels !== null && !testError && (
                    <span className="text-xs text-success font-medium flex items-center gap-1">
                      <RiCheckLine size={13} /> {testModels.length} model{testModels.length !== 1 ? "s" : ""} found
                    </span>
                  )}
                  {testError && (
                    <span className="text-xs text-error">{testError}</span>
                  )}
                </div>

                {testModels && testModels.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <label className="label text-xs text-base-content/50 pb-0">Default Model</label>
                    <select
                      className="select select-bordered select-sm w-full text-xs font-mono"
                      value={form.default_model}
                      onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                    >
                      <option value="">Select a default model…</option>
                      {testModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="modal-action mt-1">
                <button type="button" className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-base-content/60 hover:text-base-content hover:bg-base-200 transition-colors" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-xs" /> : null}
                  {editingId ? "Save changes" : "Add Provider"}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={closeModal} />
        </div>
      )}
    </div>
  );
}

function AiTab() {
  const [config, setConfig] = useState<AiConfig>(BLANK_AI_CONFIG);
  const [models, setModels] = useState<OrModel[]>([]);
  const [hasKey, setHasKey] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/platform/ai-config").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/openrouter/models").then((r) => (r.ok ? r.json() : { models: [] })),
      fetch("/api/integrations").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([cfg, mdl, intg]) => {
        if (cfg) setConfig({
          default_model: cfg.default_model ?? "",
          system_prompt: cfg.system_prompt ?? "",
          user_prompt: cfg.user_prompt ?? "",
          email_examples: cfg.email_examples ?? "",
          linkedin_examples: cfg.linkedin_examples ?? "",
          base_url: cfg.base_url ?? "",
          api_key: cfg.api_key ?? "",
        });
        setModels(mdl?.models ?? []);
        const rows: { key: string; configured: boolean }[] = Array.isArray(intg) ? intg : (intg?.result ?? []);
        setHasKey(Boolean(rows.find((r) => r.key === "openrouter")?.configured));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/platform/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default_model: config.default_model || null,
        system_prompt: config.system_prompt || null,
        user_prompt: config.user_prompt || null,
        email_examples: config.email_examples || null,
        linkedin_examples: config.linkedin_examples || null,
        base_url: config.base_url || null,
        api_key: config.api_key || null,
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save AI settings"); return; }
    toast.success("AI settings saved");
  }

  const set = (patch: Partial<AiConfig>) => setConfig((c) => ({ ...c, ...patch }));

  if (loading) return <div className="flex items-center gap-2 text-sm text-base-content/40 py-10"><span className="loading loading-spinner loading-xs" /> Loading…</div>;

  return (
    <div className="flex flex-col gap-4">
      {!hasKey && (
        <div className="rounded-2xl border border-warning/25 bg-warning/[0.08] px-4 py-3 text-sm text-warning">
          Add an <b>OpenRouter</b> API key in the Integrations tab, or add a <b>Custom AI Provider</b> below to enable AI features.
        </div>
      )}

      {/* Custom AI Providers */}
      <CustomProvidersCard />

      {/* Default model */}
      <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-5">
        <div className="flex items-center gap-2 mb-1">
          <RiRobot2Line size={16} className="text-base-content/50" />
          <h3 className="text-[15px] font-semibold">Default AI model</h3>
        </div>
        <p className="text-[13px] text-base-content/50 mb-4">
          Used to classify inbox replies (positive, objection, out-of-office, unsubscribe) and as the fallback model when a campaign step has AI writing on without its own model.
        </p>
        <ModelPicker
          models={models}
          value={config.default_model}
          onChange={(id) => set({ default_model: id })}
          placeholder="Select a default model…"
        />
      </div>

      {/* Prompts */}
      <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-[15px] font-semibold">Writing style (optional)</h3>
          <p className="text-[13px] text-base-content/50 mt-1">Guide how AI writes outreach across every campaign. Leave blank to use Outbount&apos;s defaults.</p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-base-content">System prompt</span>
          <textarea className="textarea textarea-bordered min-h-20 text-sm" placeholder="e.g. You are a concise, friendly B2B SDR. Never use hype or exclamation marks." value={config.system_prompt} onChange={(e) => set({ system_prompt: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-base-content">User prompt</span>
          <textarea className="textarea textarea-bordered min-h-20 text-sm" placeholder="Extra instructions appended to every generation." value={config.user_prompt} onChange={(e) => set({ user_prompt: e.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 w-full">
            <span className="text-[13px] font-medium text-base-content">Email examples</span>
            <textarea className="textarea textarea-bordered w-full min-h-24 text-sm" placeholder="Paste 1–3 great emails as few-shot examples." value={config.email_examples} onChange={(e) => set({ email_examples: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 w-full">
            <span className="text-[13px] font-medium text-base-content">LinkedIn examples</span>
            <textarea className="textarea textarea-bordered w-full min-h-24 text-sm" placeholder="Paste 1–3 great LinkedIn messages." value={config.linkedin_examples} onChange={(e) => set({ linkedin_examples: e.target.value })} />
          </label>
        </div>
      </div>

      {/* Workspace-level Custom Base URL & API Key (legacy / advanced) */}
      <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-5 flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <RiServerLine size={16} className="text-base-content/50" />
            <h3 className="text-[15px] font-semibold">Workspace-level API Override</h3>
          </div>
          <p className="text-[13px] text-base-content/50">
            A single custom provider applied workspace-wide. For per-campaign control, use <strong>Custom AI Providers</strong> above instead.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-base-content">Custom API Base URL</span>
          <p className="text-[12px] text-base-content/40 -mt-0.5">
            e.g.{" "}
            <code className="bg-base-200 px-1 py-0.5 rounded font-mono text-[11px]">http://localhost:11434/v1</code> for Ollama
          </p>
          <input
            type="url"
            className="input input-bordered w-full text-sm font-mono"
            placeholder="https://openrouter.ai/api/v1  (default)"
            value={config.base_url}
            onChange={(e) => set({ base_url: e.target.value })}
            spellCheck={false}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-base-content">Custom API Key</span>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              className="input input-bordered w-full text-sm font-mono pr-12"
              placeholder="sk-or-...  (leave blank to use env key)"
              value={config.api_key}
              onChange={(e) => set({ api_key: e.target.value })}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-base-content/40 hover:text-base-content/70 transition-colors select-none"
              tabIndex={-1}
            >
              {showApiKey ? "Hide" : "Show"}
            </button>
          </div>
        </label>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 h-10 px-5 rounded-[10px] text-sm font-semibold bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? <span className="loading loading-spinner loading-xs" /> : null}
          Save AI settings
        </button>
      </div>
    </div>
  );
}


// ─── General Tab ──────────────────────────────────────────────────────────────

// ─── MCP card ─────────────────────────────────────────────────────────────────
// Lets the user grab the hosted MCP URL for this Outbount instance (self-hosted, so
// it's built from the browser's own origin) and copy the one-liner to connect an
// AI agent. Hidden unless this build exposes the hosted MCP capability.

function McpCard() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mcpUrl, setMcpUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMcpUrl(`${window.location.origin}/api/mcp`);
    }
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  }

  if (!mcpUrl) return null;

  const cliCommand = `claude mcp add --transport http outbount ${mcpUrl}`;

  return (
    <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <RiFlashlightLine size={13} className="text-primary shrink-0" />
        <p className="text-xs font-medium text-base-content/40 uppercase tracking-wide">MCP — connect an AI agent</p>
        <RiArrowDownSLine size={15} className={`ml-auto text-base-content/30 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-xs text-base-content/50 mb-3 leading-relaxed">
            Connect Claude Code, Claude.ai, Cursor, or any MCP-compatible AI agent to this Outbount instance —
            it can read contacts, launch campaigns, and review replies on your behalf.
          </p>

          <div className="rounded-[10px] border border-[var(--border-subtle)] bg-base-200 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-base-content/40 mb-2">
              MCP server URL
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-md bg-base-100 border border-[var(--border-subtle)] px-3 py-2 text-xs text-base-content font-mono">
                {mcpUrl}
              </code>
              <button
                onClick={() => copy(mcpUrl)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-base-content/70 hover:bg-base-200 transition-colors"
              >
                {copied ? <RiCheckLine size={13} className="text-success" /> : <RiFileCopyLine size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-base-content/50 leading-relaxed">
            <p className="mb-1.5"><span className="text-base-content/70 font-medium">Claude Code</span> — run this in your terminal:</p>
            <div className="flex items-center gap-2 mb-1.5">
              <code className="flex-1 min-w-0 truncate rounded-md bg-base-200 border border-[var(--border-subtle)] px-3 py-2 text-xs text-base-content font-mono">
                {cliCommand}
              </code>
              <button
                onClick={() => copy(cliCommand)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-base-content/70 hover:bg-base-200 transition-colors"
              >
                <RiFileCopyLine size={13} />
              </button>
            </div>
            <p>
              Other agents (Cursor, Claude desktop/web, etc.) — add it as an HTTP MCP server / connector
              using the URL above. You&apos;ll be prompted to sign in to Outbount in the browser on first use.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GeneralTab({ hasMcp }: { hasMcp: boolean }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [importCap, setImportCap] = useState<number | "">("");
  const [capSaving, setCapSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/import-cap").then((r) => r.json()).then((d) => setImportCap(d.cap ?? 1500)).catch(() => { });
  }, []);

  async function saveImportCap(e: React.FormEvent) {
    e.preventDefault();
    setCapSaving(true);
    const res = await fetch("/api/settings/import-cap", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cap: Number(importCap) }),
    });
    setCapSaving(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Failed"); return; }
    toast.success("Daily import limit saved");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) { toast.error("Passwords don't match"); return; }
    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    });
    setLoading(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Failed"); return; }
    toast.success("Password changed");
    setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  return (
    <div className="max-w-sm flex flex-col gap-4">
      {/* Account */}
      <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-4">
        <p className="text-xs font-medium text-base-content/40 uppercase tracking-wide mb-2">Account</p>
        <p className="text-sm text-base-content/70">
          Signed in as <span className="text-base-content font-medium">{session?.user?.email ?? "—"}</span>
        </p>
      </div>

      {/* Daily import limit */}
      <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-4">
        <div className="flex items-center gap-2 mb-1">
          <RiDownloadLine size={13} className="text-base-content/40" />
          <p className="text-xs font-medium text-base-content/40 uppercase tracking-wide">Daily import limit</p>
        </div>
        <p className="text-xs text-base-content/50 mb-3">
          Max contacts imported from Sales Navigator per day (across all lists). Larger lists are split into batches over consecutive days to stay under LinkedIn&apos;s radar.
        </p>
        <form onSubmit={saveImportCap} className="flex items-end gap-2">
          <div className="flex-1">
            <input type="number" min={1} className="input input-bordered input-sm w-full" placeholder="1500" value={importCap} onChange={(e) => setImportCap(e.target.value === "" ? "" : Number(e.target.value))} required />
          </div>
          <button type="submit" disabled={capSaving} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50">
            {capSaving ? <span className="loading loading-spinner loading-xs" /> : "Save"}
          </button>
        </form>
      </div>

      {hasMcp && <McpCard />}

      {/* Product tour */}
      <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-4">
        <div className="flex items-center gap-2 mb-2">
          <RiCompassLine size={13} className="text-base-content/40" />
          <p className="text-xs font-medium text-base-content/40 uppercase tracking-wide">Product tour</p>
        </div>
        <p className="text-xs text-base-content/50 mb-3">
          Replay the guided walkthrough for any page.
        </p>
        <select
          className="w-full px-3 py-1.5 rounded-[10px] text-sm bg-base-100 border border-[var(--border)] text-base-content focus:outline-none focus:border-[var(--border-focus)] cursor-pointer"
          defaultValue=""
          onChange={(e) => {
            const page = e.target.value as TourPage;
            if (!page) return;
            e.target.value = "";
            if (page === "settings") {
              replayPageTour(page);
            } else {
              router.push(page === "dashboard" ? "/" : `/${page}`).then(() => setTimeout(() => replayPageTour(page), 400));
            }
          }}
        >
          <option value="">Select a page to replay…</option>
          {ALL_TOUR_PAGES.map((p) => (
            <option key={p} value={p}>{TOUR_PAGE_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {/* Change password */}
      <div className="bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <RiLockPasswordLine size={13} className="text-base-content/40" />
          <p className="text-xs font-medium text-base-content/40 uppercase tracking-wide">Change password</p>
        </div>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
          <div>
            <label className="label text-xs text-base-content/50 pb-1">Current password</label>
            <input type="password" className="input input-bordered input-sm w-full" placeholder="Current password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
          </div>
          <div>
            <label className="label text-xs text-base-content/50 pb-1">New password</label>
            <input type="password" className="input input-bordered input-sm w-full" placeholder="Min. 8 characters" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} minLength={8} required />
          </div>
          <div>
            <label className="label text-xs text-base-content/50 pb-1">Confirm new password</label>
            <input type="password" className="input input-bordered input-sm w-full" placeholder="Repeat new password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={loading} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? <span className="loading loading-spinner loading-xs" /> : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Proxies Tab ─────────────────────────────────────────────────────────────

function ProxiesTab({ initialProxies }: { initialProxies: ProxyRecord[] }) {
  const router = useRouter();
  const [proxies, setProxies] = useState<ProxyRecord[]>(initialProxies);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState({ host: "", port: "", protocol: "HTTP", username: "", password: "", name: "" });
  const [rawText, setRawText] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editProxyId, setEditProxyId] = useState<string | null>(null);

  const [localStatus, setLocalStatus] = useState<Record<string, { status: string, latency: number | null, loading: boolean }>>({});

  function refresh() {
    router.replace(router.asPath, undefined, { scroll: false });
  }

  useEffect(() => {
    setProxies(initialProxies);
  }, [initialProxies]);

  async function createOrEditProxy(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const body = bulkMode ? { raw_text: rawText } : {
      host: form.host,
      port: Number(form.port),
      protocol: form.protocol,
      username: form.username,
      password: form.password,
      name: form.name
    };

    const method = editProxyId ? "PUT" : "POST";
    const url = editProxyId ? `/api/proxies/${editProxyId}` : "/api/proxies";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Failed to save proxy"); return; }
    toast.success(editProxyId ? "Proxy updated" : "Proxy added");
    setShowModal(false);
    setEditProxyId(null);
    setForm({ host: "", port: "", protocol: "HTTP", username: "", password: "", name: "" });
    setRawText("");
    refresh();
  }

  async function testProxyModal() {
    setTesting(true);
    const body = { host: form.host, port: Number(form.port), protocol: form.protocol, username: form.username, password: form.password };
    const res = await fetch("/api/proxies/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setTesting(false);
    const data = await res.json();
    if (data.success) toast.success(`Passed! (${data.latency}ms)`);
    else toast.error(`Connection failed`);
  }

  function openEditProxy(p: ProxyRecord) {
    setForm({ host: p.host, port: String(p.port), protocol: p.protocol, username: p.username || "", password: "", name: p.name });
    setEditProxyId(p.id);
    setBulkMode(false);
    setShowModal(true);
  }

  async function deleteProxy(p: ProxyRecord) {
    if (!confirm(`Are you sure you want to delete ${p.name}? ${p.assigned_account_count} LinkedIn accounts assigned to this proxy will revert to Direct Connection.`)) return;
    const res = await fetch(`/api/proxies/${p.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete proxy"); return; }
    toast.success("Proxy deleted");
    refresh();
  }

  async function checkAll() {
    setCheckingAll(true);
    for (const p of proxies) {
      await checkProxy(p.id, false);
    }
    setCheckingAll(false);
    toast.success("All proxies checked");
  }

  async function checkProxy(id: string, notify = true) {
    setLocalStatus(prev => ({ ...prev, [id]: { ...prev[id], loading: true } }));
    const res = await fetch(`/api/proxies/${id}/check`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setLocalStatus(prev => ({ ...prev, [id]: { status: data.status, latency: data.response_time_ms, loading: false } }));
      if (notify) {
        if (data.status === "ACTIVE") toast.success(`ACTIVE (${data.response_time_ms}ms)`);
        else toast.error(`Status: ${data.status}`);
      }
    } else {
      setLocalStatus(prev => ({ ...prev, [id]: { status: "ERROR", latency: null, loading: false } }));
      if (notify) toast.error(data.error || "Check failed");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-base-content/50">Manage residential or datacenter proxies.</p>
        <div className="flex gap-2">
          <button
            disabled={checkingAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-base-200 text-base-content hover:bg-base-300 transition-colors disabled:opacity-50"
            onClick={checkAll}
          >
            {checkingAll ? <span className="loading loading-spinner loading-xs" /> : <RiShieldCheckLine size={14} />} Check All
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
            onClick={() => { setEditProxyId(null); setForm({ host: "", port: "", protocol: "HTTP", username: "", password: "", name: "" }); setShowModal(true); }}
          >
            <RiAddLine size={14} /> Add Proxy
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto bg-base-100 border border-[var(--border-subtle)] rounded-2xl shadow-[var(--shadow-raised)]">
        <table className="table table-sm w-full min-w-[900px]">
          <thead>
            <tr className="text-base-content/50 border-b border-[var(--border-subtle)]">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Protocol</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Auth</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Latency</th>
              <th className="px-4 py-3">Accounts</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {proxies.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-base-content/40">No proxies added yet.</td></tr>
            ) : proxies.map((p) => {
              const currentStatus = localStatus[p.id]?.status || p.status;
              const currentLatency = localStatus[p.id]?.latency || p.response_time_ms;
              const isLoading = localStatus[p.id]?.loading;
              return (
                <tr key={p.id} className="border-b border-[var(--border-subtle)] hover:bg-base-200/50">
                  <td className="px-4 py-3 font-medium text-sm whitespace-nowrap max-w-[140px] truncate" title={p.name}>{p.name}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap max-w-[120px]">
                    {p.location ? (
                      <span className="text-base-content/70">{p.location}</span>
                    ) : (
                      <span className="text-base-content/30 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap">{p.protocol}</td>
                  <td className="px-4 py-3 text-xs font-mono whitespace-nowrap">{p.host}:{p.port}</td>
                  <td className="px-4 py-3 text-xs text-base-content/60 whitespace-nowrap">{p.username ? `${p.username}:***` : "None"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isLoading && <span className="loading loading-spinner loading-xs text-primary shrink-0" />}
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${currentStatus === "ACTIVE" ? "bg-success/15 text-success" : currentStatus === "ERROR" ? "bg-error/15 text-error" : "bg-base-200 text-base-content/50"}`}>
                        {currentStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-base-content/60 whitespace-nowrap">{currentLatency ? `${currentLatency}ms` : "-"}</td>
                  <td className="px-4 py-3 text-xs text-base-content/60 whitespace-nowrap">{p.assigned_account_count}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => checkProxy(p.id)} disabled={isLoading} className="btn btn-xs btn-ghost text-base-content/60 hover:text-primary transition-colors" title="Test Connection">
                        {isLoading ? <span className="loading loading-spinner w-3" /> : <RiShieldCheckLine size={13} />}
                      </button>
                      <button onClick={() => openEditProxy(p)} className="btn btn-xs btn-ghost text-base-content/60 hover:text-base-content transition-colors" title="Edit Proxy"><RiEdit2Line size={13} /></button>
                      <button onClick={() => deleteProxy(p)} className="btn btn-xs btn-ghost text-base-content/60 hover:text-error transition-colors" title="Delete Proxy"><RiDeleteBinLine size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal modal-open">
          <div className="modal-box bg-base-100 border border-[var(--border-subtle)] rounded-2xl max-w-lg">
            <h3 className="font-semibold text-base mb-4">{editProxyId ? "Edit Proxy" : "Add Proxy"}</h3>

            {!editProxyId && (
              <div className="tabs tabs-boxed mb-4 p-1 inline-flex bg-base-200">
                <button className={`tab tab-sm ${!bulkMode ? "bg-base-100 shadow-sm font-medium" : ""}`} onClick={() => setBulkMode(false)}>Single Entry</button>
                <button className={`tab tab-sm ${bulkMode ? "bg-base-100 shadow-sm font-medium" : ""}`} onClick={() => setBulkMode(true)}>Bulk Import</button>
              </div>
            )}

            <form onSubmit={createOrEditProxy}>
              {bulkMode && !editProxyId ? (
                <div>
                  <p className="text-xs text-base-content/60 mb-2">
                    Paste raw proxy list. Supported formats: <br />
                    <code className="text-[10px] bg-base-200 p-0.5 rounded">host:port:user:pass</code> or <code className="text-[10px] bg-base-200 p-0.5 rounded">http://user:pass@host:port</code>
                  </p>
                  <textarea className="textarea textarea-bordered w-full h-32 font-mono text-xs" value={rawText} onChange={e => setRawText(e.target.value)} required placeholder="127.0.0.1:8080:user:pass..." />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Host/IP</label>
                      <input type="text" className="input input-bordered input-sm w-full font-mono" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
                    </div>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Port</label>
                      <input type="number" className="input input-bordered input-sm w-full font-mono" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Protocol</label>
                      <select className="select select-bordered select-sm w-full font-mono" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                        <option value="HTTP">HTTP</option>
                        <option value="HTTPS">HTTPS</option>
                        <option value="SOCKS5">SOCKS5</option>
                      </select>
                      {form.protocol === "SOCKS5" && (
                        <p className="text-[10px] text-base-content/50 mt-1">
                          SOCKS5 proxies require IP whitelisting in your provider.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Name (Optional)</label>
                      <input type="text" className="input input-bordered input-sm w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="US-East-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Username (Optional)</label>
                      <input type="text" className="input input-bordered input-sm w-full" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                    </div>
                    <div>
                      <label className="label text-xs text-base-content/50 pb-1">Password (Optional)</label>
                      <input type="password" className="input input-bordered input-sm w-full" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editProxyId ? "(unchanged)" : ""} />
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-action mt-6">
                {!bulkMode && (
                  <button type="button" className="btn btn-sm btn-outline btn-info mr-auto" onClick={testProxyModal} disabled={testing}>
                    {testing ? <span className="loading loading-spinner loading-xs" /> : "Test Connection"}
                  </button>
                )}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={loading || testing}>
                  {loading ? <span className="loading loading-spinner loading-xs" /> : "Save"}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setShowModal(false)} />
        </div>
      )}
    </div>
  );
}