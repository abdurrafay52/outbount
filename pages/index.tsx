import Head from "next/head";
import { useEffect, useState, useRef, useMemo } from "react";
import { FiUserPlus, FiMessageSquare, FiEye, FiRepeat, FiUsers, FiRefreshCw } from "react-icons/fi";
import { RiMailSendLine, RiReplyLine, RiRobot2Line, RiLinkedinBoxLine, RiFilterLine } from "react-icons/ri";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DashboardStats {
  totals: {
    total_targets: number;
    connections_requested: number;
    connected: number;
    messages_sent: number;
    inmails_sent: number;
    replies_received: number;
    active_runs: number;
    total_lists: number;
    total_workflows: number;
    emails_sent: number;
    email_replies: number;
  };
  today: {
    visits_today: number;
    connections_today: number;
    messages_today: number;
    inmails_today: number;
  };
  activity: { day: string; visits: number; connections: number; messages: number; inmails: number; emails: number }[];
  lists: { id: string; name: string }[];
  workflows: { id: string; name: string }[];
}

interface AgentStats {
  daily: { day: string; cost_usd: number; input_tokens: number; output_tokens: number }[];
}

interface AccountRow {
  id: string;
  is_authenticated: number;
  li_connections: number | null;
  li_pending: number | null;
  li_profile_views: number | null;
  li_stats_synced_at: string | null;
}

// ── Animated counter ──────────────────────────────────────────────────────────

function Counter({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>(0);
  const start = useRef<number>(0);
  const from = useRef<number>(0);

  useEffect(() => {
    from.current = display;
    start.current = 0;
    cancelAnimationFrame(raf.current);
    function step(ts: number) {
      if (!start.current) start.current = ts;
      const p = Math.min((ts - start.current) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from.current + (value - from.current) * ease));
      if (p < 1) raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]); // eslint-disable-line

  return <>{display.toLocaleString()}</>;
}

// ── Channel section header ─────────────────────────────────────────────────────

function ChannelHeader({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
        {icon} {label}
      </span>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, icon, pulse,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111111] p-5 transition-colors hover:border-neutral-300 dark:hover:border-neutral-700"
      style={{ "--kpi-color": color } as React.CSSProperties}
    >
      <div className="mb-4 flex items-start justify-between">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
        {pulse && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
          </span>
        )}
      </div>
      <div className="mb-1 text-[30px] font-bold leading-none tracking-tight text-neutral-900 dark:text-neutral-100 tabular-nums">
        <Counter value={value} />
      </div>
      <div className="text-[13px] font-medium text-neutral-600 dark:text-neutral-400">{label}</div>
      {sub && <div className="text-xs font-semibold mt-1" style={{ color }}>{sub}</div>}
    </div>
  );
}

// ── Funnel bar row ─────────────────────────────────────────────────────────────

function FunnelRow({
  icon, color, label, value, max,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 group">
      <span
        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, color }}
      >
        {icon}
      </span>
      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 w-10 text-right">
        <Counter value={value} />
      </span>
    </div>
  );
}


// ── Activity chart ────────────────────────────────────────────────────────────

const SERIES = [
  { key: "visits" as const, color: "#3B82F6", label: "Visits" },
  { key: "connections" as const, color: "#22C55E", label: "Connects" },
  { key: "messages" as const, color: "#A855F7", label: "Messages" },
  { key: "inmails" as const, color: "#F59E0B", label: "InMails" },
  { key: "emails" as const, color: "#06B6D4", label: "Emails" },
];

const DAY_OPTIONS = [7, 14, 30, 90];

function ActivityChart({
  data = [],
  days,
  onDaysChange,
}: {
  data: any[];
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const [activeSeries, setActiveSeries] = useState<Set<string>>(
    new Set(SERIES.map((s) => s.key))
  );
  const [customDate, setCustomDate] = useState<string>("");

  useEffect(() => {
    if (DAY_OPTIONS.includes(days)) {
      setCustomDate("");
    }
  }, [days]);

  // Data Normalization: Fills missing days with 0s
  const normalizedData = useMemo(() => {
    if (!Array.isArray(data)) return [];

    const dataMap = new Map<string, any>();
    data.forEach((item) => {
      if (item?.day) dataMap.set(item.day, item);
    });

    const result = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateKey = d.toISOString().split("T")[0];

      const existing = dataMap.get(dateKey);
      if (existing) {
        result.push(existing);
      } else {
        result.push({
          day: dateKey,
          visits: 0,
          connections: 0,
          messages: 0,
          inmails: 0,
          emails: 0,
        });
      }
    }
    return result;
  }, [data, days]);

  // Dynamic bar sizes based on total days viewed
  const { maxBarSize, barGap } = useMemo(() => {
    if (days <= 7) return { maxBarSize: 36, barGap: 4 };
    if (days <= 14) return { maxBarSize: 22, barGap: 3 };
    if (days <= 30) return { maxBarSize: 10, barGap: 2 };
    if (days <= 60) return { maxBarSize: 6, barGap: 1 };
    return { maxBarSize: 4, barGap: 0 };
  }, [days]);

  function toggleSeries(key: string) {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      let formattedLabel = label;
      try {
        const dateObj = new Date(label);
        if (!isNaN(dateObj.getTime())) {
          formattedLabel = dateObj.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }
      } catch (e) { }

      return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs shadow-2xl z-50">
          <div className="text-neutral-500 dark:text-neutral-400 mb-1.5 font-semibold">
            {formattedLabel}
          </div>
          {payload.map((entry: any, index: number) => (
            <div
              key={index}
              className="flex items-center justify-between gap-5 my-1 min-w-[130px]"
            >
              <span className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: entry.color }}
                />
                {entry.name}
              </span>
              <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="flex flex-col rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111111] p-5 sm:p-6 w-full"
      style={{ minHeight: 340 }}
      data-tour="dashboard-chart"
    >
      {/* Header Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Activity Overview
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {SERIES.map((s) => (
              <button
                key={s.key}
                onClick={() => toggleSeries(s.key)}
                className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ opacity: activeSeries.has(s.key) ? 1 : 0.3 }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ background: s.color }}
                />
                <span className="text-neutral-700 dark:text-neutral-300">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Timeframe Buttons & Native Date Input */}
        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => {
                setCustomDate("");
                onDaysChange(d);
              }}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${days === d && !customDate
                ? "bg-neutral-900 !text-white dark:bg-white dark:!text-black shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                }`}
            >
              {d}d
            </button>
          ))}

          <div
            className={`flex items-center ml-1 px-2 py-1 rounded-md transition-all ${customDate
              ? "bg-neutral-200 dark:bg-neutral-800"
              : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
              }`}
          >
            <input
              type="date"
              value={customDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => {
                const val = e.target.value;
                setCustomDate(val);
                if (!val) {
                  onDaysChange(7);
                  return;
                }
                const selectedDate = new Date(val);
                const today = new Date();
                const diffTime = today.getTime() - selectedDate.getTime();
                const diffDays = Math.max(
                  1,
                  Math.round(diffTime / (1000 * 3600 * 24))
                );
                onDaysChange(diffDays);
              }}
              className="bg-transparent text-xs font-semibold text-neutral-600 dark:text-neutral-400 cursor-pointer outline-none [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={normalizedData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            barGap={barGap}
          >
            <CartesianGrid vertical={false} stroke="#525252" opacity={0.15} />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#737373" }}
              allowDecimals={false}
            />

            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#737373" }}
              minTickGap={20}
              tickFormatter={(val) => {
                if (!val) return "";
                try {
                  const d = new Date(val);
                  if (isNaN(d.getTime())) return val.slice(5);
                  return days <= 14
                    ? d.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                    : `${d.getMonth() + 1}/${d.getDate()}`;
                } catch {
                  return val;
                }
              }}
              dy={8}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(150, 150, 150, 0.05)" }}
            />

            {SERIES.filter((s) => activeSeries.has(s.key)).map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={maxBarSize}
                minPointSize={4} /* Enables 4px height stub for 0-value bars */
              >
                {normalizedData.map((entry: any, index: number) => (
                  <Cell
                    key={`cell-${index}`}
                    /* 0 values get 15% opacity so they look like sleek ghost stubs */
                    fillOpacity={entry[s.key] === 0 ? 0.15 : 1}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
// ── LinkedIn stats card ───────────────────────────────────────────────────────

interface LiStats { connections: number; pending: number; profile_views: number }

function LinkedInCard({
  accountId, cachedStats, cachedSyncedAt,
}: {
  accountId?: string;
  cachedStats?: LiStats | null;
  cachedSyncedAt?: string | null;
}) {
  const [syncing, setSyncing] = useState(false);
  const [liStats, setLiStats] = useState<LiStats | null>(cachedStats ?? null);
  const [syncedAt, setSyncedAt] = useState<string | null>(cachedSyncedAt ?? null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync() {
    if (!accountId) return;
    setSyncing(true); setSyncError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/li-stats`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setLiStats(data);
      setSyncedAt(new Date().toISOString());
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const items = [
    { label: "Connections", value: liStats?.connections ?? null, color: "#3B82F6" },
    { label: "Pending sent", value: liStats?.pending ?? null, color: "#A855F7" },
    { label: "Profile views", value: liStats?.profile_views ?? null, color: "#06B6D4" },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111111] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RiLinkedinBoxLine size={15} className="text-neutral-500 dark:text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">LinkedIn</span>
        </div>
        <div className="flex items-center gap-2">
          {syncedAt && (
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
              {new Date(syncedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {accountId && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-40"
            >
              <FiRefreshCw size={11} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing" : "Sync"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {items.map(s => (
          <div key={s.label} className="flex flex-col justify-between gap-1.5 bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80 rounded-lg p-2.5 sm:p-3 min-w-0 overflow-hidden">
            {s.value !== null
              ? <span className="text-lg sm:text-xl font-bold tabular-nums leading-none" style={{ color: s.color }}><Counter value={s.value} /></span>
              : <span className="text-lg sm:text-xl font-bold text-neutral-300 dark:text-neutral-700 leading-none">—</span>
            }
            <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide leading-tight truncate" title={s.label}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {syncError && <p className="text-xs text-red-500 mt-2">{syncError}</p>}
      {!accountId && <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">No authenticated account.</p>}
    </div>
  );
}
// ── AI usage panel ────────────────────────────────────────────────────────────

function AiUsagePanel({ data, days }: { data: AgentStats["daily"]; days: number }) {
  const totalCost = data.reduce((s, d) => s + (d.cost_usd ?? 0), 0);
  const totalTokens = data.reduce((s, d) => s + (d.input_tokens ?? 0) + (d.output_tokens ?? 0), 0);
  const hasData = totalCost > 0 || totalTokens > 0;
  const maxCost = Math.max(...data.map(d => d.cost_usd ?? 0), 0.000001);
  const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 5 : 15;

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111111] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RiRobot2Line size={15} className="text-neutral-500 dark:text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">AI Usage</span>
        </div>
        {hasData && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-neutral-500 dark:text-neutral-400 tabular-nums">{totalTokens.toLocaleString()} tokens</span>
            <span className="font-semibold tabular-nums text-amber-500">${totalCost.toFixed(4)}</span>
          </div>
        )}
      </div>

      {!hasData ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 py-2">No AI usage in this period.</p>
      ) : (
        <div className="flex items-end gap-1" style={{ height: 56 }}>
          {data.map((d, i) => {
            const showLabel = i % labelEvery === 0;
            const height = Math.max(4, ((d.cost_usd ?? 0) / maxCost) * 48);
            return (
              <div key={d.day} className="flex flex-col items-center flex-1 group relative justify-end" style={{ height: "100%" }}>
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-30 shadow-xl">
                  <div className="text-neutral-500 dark:text-neutral-400 mb-1 font-semibold">{d.day}</div>
                  <div className="text-amber-500 font-semibold">${(d.cost_usd ?? 0).toFixed(5)}</div>
                  <div className="text-neutral-600 dark:text-neutral-400">{((d.input_tokens ?? 0) + (d.output_tokens ?? 0)).toLocaleString()} tok</div>
                </div>
                <div
                  className="w-full rounded-t"
                  style={{ height, background: "#F59E0B", opacity: (d.cost_usd ?? 0) === 0 ? 0.2 : 0.85 }}
                />
                {showLabel && (
                  <span className="text-[9px] font-medium text-neutral-400 dark:text-neutral-500 mt-1 leading-none">{d.day.slice(5)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({
  lists, workflows, listId, workflowId, onListChange, onWorkflowChange,
}: {
  lists: { id: string; name: string }[];
  workflows: { id: string; name: string }[];
  listId: string;
  workflowId: string;
  onListChange: (id: string) => void;
  onWorkflowChange: (id: string) => void;
}) {
  const hasFilter = listId || workflowId;
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <RiFilterLine size={14} className="text-neutral-500 dark:text-neutral-400 shrink-0" />
      <select
        value={listId}
        onChange={(e) => { onListChange(e.target.value); if (e.target.value) onWorkflowChange(""); }}
        className={`select select-bordered select-sm h-8 min-h-0 text-xs bg-base-100 border-[var(--border-subtle)] focus:border-primary focus:outline-none shadow-none w-full sm:w-auto ${listId ? "border-[var(--border-strong)] font-medium" : "hover:border-[var(--border-strong)]"
          }`}
      >
        <option value="">All lists</option>
        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <select
        value={workflowId}
        onChange={(e) => { onWorkflowChange(e.target.value); if (e.target.value) onListChange(""); }}
        className={`select select-bordered select-sm h-8 min-h-0 text-xs bg-base-100 border-[var(--border-subtle)] focus:border-primary focus:outline-none shadow-none w-full sm:w-auto ${workflowId ? "border-[var(--border-strong)] font-medium" : "hover:border-[var(--border-strong)]"
          }`}
      >
        <option value="">All campaigns</option>
        {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {hasFilter && (
        <button
          onClick={() => { onListChange(""); onWorkflowChange(""); }}
          className="h-8 px-2.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [hasPremium, setHasPremium] = useState(false);
  const [error, setError] = useState(false);
  const [days, setDays] = useState(7);
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [listId, setListId] = useState("");
  const [workflowId, setWorkflowId] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then(r => r.json())
      .then((accounts: AccountRow[]) => {
        const auth = accounts.find(a => a.is_authenticated === 1);
        if (auth) setAccount(auth);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetch("/api/premium-status").then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setHasPremium(!!d.capabilities?.ai); }).catch(() => { });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ days: String(days) });
    if (listId) params.set("list_id", listId);
    if (workflowId) params.set("workflow_id", workflowId);

    Promise.all([
      fetch(`/api/dashboard/stats?${params}`).then(r => r.json()),
      fetch(`/api/dashboard/agent-stats?days=${days}`).then(r => r.json()),
    ])
      .then(([s, a]) => { if (!cancelled) { setStats(s); setAgentStats(a); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [days, listId, workflowId]);

  if (error) return <div className="text-red-500 text-sm font-medium py-10">Failed to load dashboard.</div>;

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 text-sm py-10">
        <span className="loading loading-spinner loading-xs" />
        Loading…
      </div>
    );
  }

  const { totals, today } = stats;
  const acceptanceRate = totals.connections_requested > 0
    ? Math.round((totals.connected / totals.connections_requested) * 100) : 0;
  const replyRate = totals.messages_sent > 0
    ? Math.round((totals.replies_received / totals.messages_sent) * 100) : 0;
  const emailReplyRate = totals.emails_sent > 0
    ? Math.round((totals.email_replies / totals.emails_sent) * 100) : 0;
  const maxFunnelValue = totals.total_targets;

  return (
    <>
      <Head>
        <title>Dashboard — Outbount</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Overview</p>
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-.03em] text-neutral-900 dark:text-neutral-100">Pipeline at a glance</h1>
            <p className="mt-2 text-[15px] text-neutral-600 dark:text-neutral-400">Monitor momentum across every active channel.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3" data-tour="dashboard-filters">
            {/* Filters */}
            <FilterBar
              lists={stats.lists}
              workflows={stats.workflows}
              listId={listId}
              workflowId={workflowId}
              onListChange={setListId}
              onWorkflowChange={setWorkflowId}
            />

            {/* Today pills */}
            <div className="flex flex-wrap items-center gap-1.5 sm:border-l sm:border-neutral-200 dark:sm:border-neutral-800 sm:pl-3">
              <span className="mr-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Today</span>
              {[
                { label: `${today.visits_today} visits`, color: "#3B82F6" },
                { label: `${today.connections_today} connects`, color: "#22C55E" },
                { label: `${today.messages_today} messages`, color: "#A855F7" },
                { label: `${today.inmails_today} inmails`, color: "#F59E0B" },
              ].map(p => (
                <span
                  key={p.label}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: `${p.color}18`, color: p.color }}
                >
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── KPI rows — LinkedIn then Email ── */}
        <div className="space-y-4">
          {/* LinkedIn */}
          <div>
            <ChannelHeader
              icon={<RiLinkedinBoxLine size={12} />}
              label="LinkedIn"
              color="#3B82F6"
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard
                label="Profiles visited"
                value={totals.connections_requested}
                color="#3B82F6"
                icon={<FiEye size={13} />}
              />
              <KpiCard
                label="Connections sent"
                value={totals.connections_requested}
                sub={acceptanceRate > 0 ? `${acceptanceRate}% accepted` : undefined}
                color="#22C55E"
                icon={<FiUserPlus size={13} />}
                pulse={totals.active_runs > 0}
              />
              <KpiCard
                label="Messages sent"
                value={totals.messages_sent}
                sub={replyRate > 0 ? `${replyRate}% replied` : undefined}
                color="#A855F7"
                icon={<FiMessageSquare size={13} />}
              />
              <KpiCard
                label="InMails sent"
                value={totals.inmails_sent}
                color="#F59E0B"
                icon={<RiLinkedinBoxLine size={13} />}
              />
              <KpiCard
                label="LI Replies"
                value={totals.replies_received}
                color="#F59E0B"
                icon={<FiRepeat size={13} />}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <ChannelHeader
              icon={<RiMailSendLine size={12} />}
              label="Email"
              color="#06B6D4"
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Emails sent"
                value={totals.emails_sent}
                sub={emailReplyRate > 0 ? `${emailReplyRate}% replied` : undefined}
                color="#06B6D4"
                icon={<RiMailSendLine size={13} />}
              />
              <KpiCard
                label="Email replies"
                value={totals.email_replies}
                color="#22C55E"
                icon={<RiReplyLine size={13} />}
              />
              <KpiCard
                label="Total targets"
                value={totals.total_targets}
                color="#64748B"
                icon={<FiUsers size={13} />}
              />
              <KpiCard
                label="Connected"
                value={totals.connected}
                color="#22C55E"
                icon={<FiUserPlus size={13} />}
              />
            </div>
          </div>
        </div>

        {/* ── Second row: funnel left, chart right ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">

          {/* Left: funnel + LinkedIn + AI */}
          <div className="space-y-3">
            {/* Funnel */}
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#111111]" data-tour="dashboard-funnel">
              <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Conversion path</span>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800/60 py-1">
                <FunnelRow icon={<FiUsers size={12} />} color="#64748B" label="Targets" value={totals.total_targets} max={maxFunnelValue} />
                <FunnelRow icon={<FiUserPlus size={12} />} color="#22C55E" label="Connected" value={totals.connected} max={maxFunnelValue} />
                <FunnelRow icon={<FiRepeat size={12} />} color="#F59E0B" label="LI replies" value={totals.replies_received} max={maxFunnelValue} />
                <FunnelRow icon={<RiMailSendLine size={12} />} color="#06B6D4" label="Emails sent" value={totals.emails_sent} max={maxFunnelValue} />
                <FunnelRow icon={<RiReplyLine size={12} />} color="#22C55E" label="Email replies" value={totals.email_replies} max={maxFunnelValue} />
              </div>
            </div>

            {/* LinkedIn account card */}
            <LinkedInCard
              accountId={account?.id}
              cachedStats={account?.li_connections != null ? {
                connections: account.li_connections!,
                pending: account.li_pending!,
                profile_views: account.li_profile_views!,
              } : null}
              cachedSyncedAt={account?.li_stats_synced_at}
            />

            {/* AI usage mini */}
            {hasPremium && agentStats && <AiUsagePanel data={agentStats.daily} days={days} />}
          </div>

          {/* Right: activity chart */}
          <ActivityChart data={stats.activity} days={days} onDaysChange={setDays} />
        </div>
      </div>
    </>
  );
}
