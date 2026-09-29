import Head from "next/head";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  RiMailLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiAlertLine,
  RiFireLine,
  RiSettings4Line,
  RiCloseLine,
  RiInformationLine,
  RiLineChartLine,
} from "react-icons/ri";

interface WarmupData {
  enabled: boolean;
  ramp_increment: number;
  max_target: number;
  today_target: number;
  sent_today: number;
  rescued_today: number;
  reply_rate: number;
}

interface DayData {
  day: string;
  sent: number;
  limit: number;
}

interface SenderHealth {
  sent_30d: number;
  bounces: number;
  complaints: number;
  bounce_rate: number;
  complaint_rate: number;
  paused: boolean;
  reason: string | null;
}

interface AccountRow {
  id: string;
  name: string;
  from_email: string;
  daily_email_limit: number;
  ramp_up_enabled: number;
  ramp_start_date: string | null;
  effective_limit_today: number;
  sent_today: number;
  can_receive_replies: boolean;
  health: SenderHealth | null;
  days: DayData[];
  warmup?: WarmupData;
}

interface LogEntry {
  created_at: string;
  message: string;
  email_account_id: string;
}

interface GuardEntry {
  created_at: string;
  message: string;
  email_account_id: string | null;
}

interface Data {
  accounts: AccountRow[];
  days: string[];
  recentLogs: LogEntry[];
  guardTrips: GuardEntry[];
}

const TZ = "Europe/Berlin";

function formatDay(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: TZ });
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });
}

function formatDateTime(ts: string) {
  const d = new Date(ts);
  return (
    d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: TZ }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ })
  );
}

export default function EmailHealth() {
  const [data, setData] = useState<Data | null>(null);
  const [savingWarmup, setSavingWarmup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Modal State - Strictly 3 Fields
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [modalEnabled, setModalEnabled] = useState<boolean>(false);
  const [modalRampIncrement, setModalRampIncrement] = useState<number>(2);
  const [modalMaxTarget, setModalMaxTarget] = useState<number>(30);
  const [modalReplyRate, setModalReplyRate] = useState<number>(30);
  const [savingModal, setSavingModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/email-health")
      .then((r) => r.json())
      .then((healthData) => {
        setData(healthData);
        setLastRefresh(new Date());
      })
      .catch((err) => {
        console.error("Failed to fetch email health:", err);
        toast.error("Failed to load email health data");
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleWarmup(account: AccountRow) {
    if (!account.warmup) return;
    const nextEnabled = !account.warmup.enabled;
    setSavingWarmup(account.id);

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.id === account.id && a.warmup
            ? { ...a, warmup: { ...a.warmup, enabled: nextEnabled } }
            : a
        ),
      };
    });

    try {
      const res = await fetch("/api/platform/deliverability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "configure_warmup",
          email_account_id: account.id,
          enabled: nextEnabled,
          ramp_increment: account.warmup.ramp_increment ?? 2,
          daily_target: account.warmup.max_target,
          reply_rate: account.warmup.reply_rate,
        }),
      });
      if (!res.ok) throw new Error("Failed to toggle warmup");
      toast.success(nextEnabled ? "Warmup enabled" : "Warmup paused");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update warmup");
      load();
    } finally {
      setSavingWarmup(null);
    }
  }

  function openWarmupModal(account: AccountRow) {
    setEditingAccount(account);
    setModalEnabled(account.warmup?.enabled ?? false);
    setModalRampIncrement(account.warmup?.ramp_increment ?? 2);
    setModalMaxTarget(account.warmup?.max_target ?? 30);
    setModalReplyRate(account.warmup?.reply_rate ?? 30);
  }

  function closeWarmupModal() {
    setEditingAccount(null);
  }

  async function saveWarmupSettings() {
    if (!editingAccount) return;
    setSavingModal(true);

    try {
      const res = await fetch("/api/platform/deliverability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "configure_warmup",
          email_account_id: editingAccount.id,
          enabled: modalEnabled,
          ramp_increment: modalRampIncrement,
          daily_target: modalMaxTarget,
          reply_rate: modalReplyRate,
        }),
      });

      if (!res.ok) throw new Error("Failed to update settings");

      toast.success("Warmup settings saved");
      closeWarmupModal();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSavingModal(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const totalToday = data?.accounts.reduce((s, a) => s + a.sent_today, 0) ?? 0;
  const totalLimit = data?.accounts.reduce((s, a) => s + a.effective_limit_today, 0) ?? 0;
  const overLimit = data?.accounts.filter((a) => a.sent_today > a.effective_limit_today) ?? [];

  const warmingCount = data?.accounts.filter((a) => a.warmup?.enabled).length ?? 0;
  const totalAccounts = data?.accounts.length ?? 0;

  // Chart Data Preparation (Daily Aggregates)
  const chartDays = data?.days ? [...data.days].reverse() : [];
  const chartTotals = chartDays.map((d) => {
    if (d === today) return totalToday;
    return data?.accounts.reduce((s, a) => s + (a.days.find((x) => x.day === d)?.sent ?? 0), 0) ?? 0;
  });
  const maxChartVal = Math.max(...chartTotals, 10);

  return (
    <>
      <Head>
        <title>Email Health — Outbound</title>
      </Head>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[13px] font-medium text-base-content/45">Deliverability</p>
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-.03em] text-base-content">
              Email health
            </h1>
            <p className="mt-2 text-[15px] text-base-content/50">
              Deliverability health, warmup, ramp-up, and daily send volume across every connected inbox.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-base-content/40">
                Updated {formatTime(lastRefresh.toISOString())}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-base-100 px-3 py-1.5 text-sm font-medium text-base-content transition-colors hover:bg-base-200 disabled:opacity-50"
            >
              <RiRefreshLine size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-base-100 p-5 shadow-[var(--shadow-raised)]">
            <div className="mb-1 text-[13px] text-base-content/45">Sent today</div>
            <div className="text-[28px] font-semibold leading-none tracking-[-.03em] text-base-content tabular-nums">
              {totalToday}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-base-100 p-5 shadow-[var(--shadow-raised)]">
            <div className="mb-1 text-[13px] text-base-content/45">Total limit today</div>
            <div className="text-[28px] font-semibold leading-none tracking-[-.03em] text-base-content tabular-nums">
              {totalLimit}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-base-100 p-5 shadow-[var(--shadow-raised)]">
            <div className="mb-1 text-[13px] text-base-content/45">Accounts active</div>
            <div className="text-[28px] font-semibold leading-none tracking-[-.03em] text-base-content tabular-nums">
              {data?.accounts.filter((a) => a.sent_today > 0).length ?? 0}
            </div>
          </div>
          {overLimit.length > 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-base-100 p-5 shadow-[var(--shadow-raised)]">
              <div className="mb-1 flex items-center gap-1.5 text-[13px] text-base-content/70">
                <RiAlertLine size={12} /> Over limit today
              </div>
              <div className="text-[28px] font-semibold leading-none tracking-[-.03em] text-base-content tabular-nums">
                {overLimit.length}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-5 shadow-[var(--shadow-raised)] dark:bg-emerald-950/20">
              <div className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                <RiShieldCheckLine size={14} /> All within limits
              </div>
              <div className="text-[28px] font-semibold leading-none tracking-[-.03em] text-emerald-600 dark:text-emerald-400">
                ✓
              </div>
            </div>
          )}
        </div>

        {/* Mailbox Warmup Card */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-base-100 shadow-[var(--shadow-raised)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <RiFireLine size={16} className="text-base-content/80" />
              <span className="text-sm font-semibold text-base-content">Mailbox warmup</span>
            </div>
            <span className="rounded-full border border-[var(--border-subtle)] bg-base-200/50 px-3 py-1 text-xs font-medium text-base-content/70">
              {warmingCount}/{totalAccounts} inboxes active
            </span>
          </div>

          <p className="px-5 pt-3.5 text-[13px] text-base-content/50">
            Connected inboxes send and rescue peer emails automatically to build sender reputation.
          </p>

          {totalAccounts === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-base-content/35">
              No email accounts connected yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] p-2">
              {data?.accounts.map((a) => {
                const w = a.warmup;
                const isWarming = w?.enabled ?? false;

                return (
                  <div
                    key={a.id}
                    className="grid grid-cols-1 items-center gap-4 py-3.5 px-3 transition-colors rounded-xl hover:bg-base-200/40 md:grid-cols-12"
                  >
                    {/* Account Info */}
                    <div className="md:col-span-4 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-base-content truncate">{a.name}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${isWarming
                              ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
                              : "bg-base-200 text-base-content/50 border-[var(--border-subtle)]"
                            }`}
                        >
                          {isWarming && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                          {isWarming ? "Warming" : "Paused"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-base-content/40 truncate">{a.from_email}</div>
                    </div>

                    {/* Stats: Sent & Rescued */}
                    <div className="flex items-center gap-6 md:col-span-3">
                      <div>
                        <div className="text-[10px] font-medium text-base-content/40 uppercase tracking-wider">
                          Sent Today
                        </div>
                        <div className="text-sm font-bold tabular-nums text-base-content">
                          {w?.sent_today ?? 0}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-medium text-base-content/40 uppercase tracking-wider">
                          Rescued
                          <RiInformationLine
                            size={11}
                            title="Emails rescued from spam folder back to inbox"
                            className="cursor-help text-base-content/30"
                          />
                        </div>
                        <div className="text-sm font-bold tabular-nums text-base-content">
                          {w?.rescued_today ?? 0}
                        </div>
                      </div>
                    </div>

                    {/* Display Targets */}
                    <div className="flex items-center gap-4 md:col-span-3">
                      <div>
                        <div className="text-[10px] font-medium text-base-content/40 uppercase tracking-wider">
                          Today Target
                        </div>
                        <div className="text-xs font-semibold text-base-content/80 mt-0.5">
                          {w?.today_target ?? 2} emails
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-medium text-base-content/40 uppercase tracking-wider">
                          Max Limit
                        </div>
                        <div className="text-xs font-semibold text-base-content/80 mt-0.5">
                          {w?.max_target ?? 30} /day
                        </div>
                      </div>
                    </div>

                    {/* Gear Settings Button & Toggle Switch */}
                    <div className="flex items-center justify-end gap-3 md:col-span-2">
                      <button
                        type="button"
                        onClick={() => openWarmupModal(a)}
                        title="Warmup Settings"
                        className="rounded-lg border border-[var(--border-subtle)] bg-base-200/50 p-2 text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                      >
                        <RiSettings4Line size={16} />
                      </button>

                      <button
                        type="button"
                        disabled={savingWarmup === a.id}
                        onClick={() => toggleWarmup(a)}
                        aria-pressed={isWarming}
                        title={isWarming ? "Click to pause warmup" : "Click to enable warmup"}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${isWarming
                            ? "bg-black dark:bg-white"
                            : "bg-neutral-300 dark:bg-neutral-800 border border-[var(--border-subtle)]"
                          }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full transition-transform ${isWarming
                              ? "translate-x-6 bg-white dark:bg-black"
                              : "translate-x-1 bg-neutral-500 dark:bg-neutral-400"
                            }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Per-Account Table */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-base-100 shadow-[var(--shadow-raised)]">
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-5 py-3.5">
            <RiMailLine size={14} className="text-base-content/40" />
            <span className="text-sm font-semibold text-base-content">Accounts — last 7 days</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-base-content/45">
                    Account
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-medium text-base-content/45">
                    Today
                    <br />
                    <span className="font-normal text-base-content/30">{formatDay(today)}</span>
                  </th>
                  {data?.days
                    .slice(0, -1)
                    .reverse()
                    .map((d) => (
                      <th
                        key={d}
                        className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-medium text-base-content/30"
                      >
                        {formatDay(d)}
                      </th>
                    ))}
                  <th className="whitespace-nowrap px-5 py-2.5 text-right text-xs font-medium text-base-content/45">
                    Limit today
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.accounts.map((a) => {
                  const over = a.sent_today > a.effective_limit_today;
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-[var(--border-subtle)] transition-colors hover:bg-base-200/50"
                    >
                      <td className="px-5 py-3">
                        <div className="text-xs font-medium text-base-content">{a.name}</div>
                        <div className="mt-0.5 text-xs text-base-content/40">{a.from_email}</div>
                        {!a.can_receive_replies && (
                          <div className="mt-1">
                            <span
                              title="This sender has no IMAP configured, so it can send but cannot receive."
                              className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium bg-base-200 text-base-content/60"
                            >
                              No IMAP · can&apos;t receive replies
                            </span>
                          </div>
                        )}
                        {a.health && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {a.health.paused ? (
                              <span
                                title={a.health.reason ?? "Paused by health policy"}
                                className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium bg-base-200 text-base-content/60"
                              >
                                Paused
                              </span>
                            ) : a.health.sent_30d === 0 ? (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-base-200 text-base-content/40">
                                No data
                              </span>
                            ) : (
                              <span
                                title={`30-day: ${a.health.sent_30d} sent · ${a.health.bounces} bounced`}
                                className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium bg-base-200 text-base-content/80"
                              >
                                Healthy
                              </span>
                            )}
                            {a.health.sent_30d > 0 && (
                              <span
                                className="text-[10px] text-base-content/40"
                                title="30-day bounce and complaint rate"
                              >
                                {(a.health.bounce_rate * 100).toFixed(1)}% bounce ·{" "}
                                {(a.health.complaint_rate * 100).toFixed(2)}% spam
                              </span>
                            )}
                          </div>
                        )}
                        {a.ramp_start_date && (
                          <div className="mt-0.5 text-[10px] text-base-content/35">
                            Ramp from {a.ramp_start_date}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span
                          className={`text-sm font-semibold tabular-nums ${over
                              ? "text-base-content font-bold underline"
                              : a.sent_today > 0
                                ? "text-base-content"
                                : "text-base-content/30"
                            }`}
                        >
                          {a.sent_today}
                        </span>
                        <div className="ml-auto mt-1 h-1 w-16 rounded-full bg-base-200">
                          <div
                            className="h-1 rounded-full bg-base-content"
                            style={{
                              width: `${Math.min(
                                100,
                                (a.sent_today / Math.max(a.effective_limit_today, 1)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </td>

                      {a.days
                        .slice(0, -1)
                        .reverse()
                        .map((d) => (
                          <td key={d.day} className="px-4 py-3 text-right">
                            <span
                              className={`text-xs tabular-nums ${d.sent > 0 ? "text-base-content/70" : "text-base-content/20"
                                }`}
                            >
                              {d.sent > 0 ? d.sent : "—"}
                            </span>
                          </td>
                        ))}
                      <td className="px-5 py-3 text-right text-xs tabular-nums text-base-content/50">
                        {a.effective_limit_today}
                        {a.ramp_up_enabled &&
                          a.ramp_start_date &&
                          a.effective_limit_today < a.daily_email_limit && (
                            <span className="ml-1 text-base-content/30">(ramp)</span>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-subtle)] bg-base-200/50">
                  <td className="px-5 py-2.5 text-xs font-medium text-base-content/60">Total</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-base-content">
                    {totalToday}
                  </td>
                  {data?.days
                    .slice(0, -1)
                    .reverse()
                    .map((d) => {
                      const sum = data.accounts.reduce(
                        (s, a) => s + (a.days.find((x) => x.day === d)?.sent ?? 0),
                        0
                      );
                      return (
                        <td
                          key={d}
                          className="px-4 py-2.5 text-right text-xs tabular-nums text-base-content/50"
                        >
                          {sum > 0 ? sum : "—"}
                        </td>
                      );
                    })}
                  <td className="px-5 py-2.5 text-right text-xs font-medium tabular-nums text-base-content/50">
                    {totalLimit}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Clean Flexbox Bar Chart (Replacing SVG) */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-base-100 p-6 shadow-[var(--shadow-raised)]">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RiLineChartLine size={18} className="text-base-content/70" />
              <h3 className="text-sm font-semibold text-base-content">
                Send Volume Trend
              </h3>
            </div>
            <span className="text-xs font-medium text-base-content/40">Last 7 Days</span>
          </div>

          {/* Bar Chart Container */}
          <div className="relative h-44 w-full">
            {/* Horizontal Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              <div className="border-t border-dashed border-base-content/10 w-full"></div>
              <div className="border-t border-dashed border-base-content/10 w-full"></div>
              <div className="border-t border-dashed border-base-content/10 w-full"></div>
              <div className="border-t border-solid border-base-content/10 w-full"></div>
            </div>

            {/* Bars */}
            <div className="absolute inset-0 flex items-end justify-between px-2 pt-4 pb-[1px]">
              {chartTotals.map((val, idx) => {
                const heightPct = maxChartVal > 0 ? (val / maxChartVal) * 100 : 0;
                return (
                  <div key={idx} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    {/* Tooltip */}
                    <div className="absolute -top-8 hidden whitespace-nowrap rounded bg-base-content px-2 py-1 text-[10px] font-semibold text-base-100 shadow-md group-hover:block z-10">
                      {val} emails
                    </div>
                    {/* The Bar */}
                    <div
                      className="w-full max-w-[28px] rounded-t-md bg-base-content/80 transition-all duration-300 ease-in-out group-hover:bg-base-content"
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X-Axis Labels */}
          <div className="mt-3 flex justify-between px-2 text-[11px] font-medium text-base-content/40">
            {chartDays.map((d) => (
              <div key={d} className="flex-1 text-center">
                {formatDay(d).split(" ")[1]} {formatDay(d).split(" ")[0]}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Logs Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recent Sends Log */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-base-100 shadow-[var(--shadow-raised)]">
            <div className="border-b border-[var(--border-subtle)] px-5 py-3.5">
              <span className="text-sm font-semibold text-base-content">Recent sends</span>
              <span className="ml-2 text-xs text-base-content/40">last 50</span>
            </div>
            <div className="max-h-96 divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {data?.recentLogs.map((l, i) => {
                const acc = data.accounts.find((a) => a.id === l.email_account_id);
                return (
                  <div key={i} className="flex items-start justify-between gap-4 px-5 py-2.5">
                    <div>
                      <div className="text-xs text-base-content/80">
                        {l.message.replace("Email sent to ", "")}
                      </div>
                      <div className="mt-0.5 text-[10px] text-base-content/35">
                        {acc?.name ?? l.email_account_id.slice(0, 8)}
                      </div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-[10px] text-base-content/35">
                      {formatDateTime(l.created_at)}
                    </div>
                  </div>
                );
              })}
              {data?.recentLogs.length === 0 && (
                <div className="px-5 py-8 text-center text-xs text-base-content/35">
                  No sends recorded
                </div>
              )}
            </div>
          </div>

          {/* Guard Trips */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-base-100 shadow-[var(--shadow-raised)]">
            <div className="border-b border-[var(--border-subtle)] px-5 py-3.5">
              <span className="text-sm font-semibold text-base-content">Limit guard trips</span>
              <span className="ml-2 text-xs text-base-content/40">today</span>
            </div>
            <div className="max-h-96 divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {data?.guardTrips.map((g, i) => {
                const acc = g.email_account_id
                  ? data.accounts.find((a) => a.id === g.email_account_id)
                  : null;
                return (
                  <div key={i} className="flex items-start justify-between gap-4 px-5 py-2.5">
                    <div>
                      <div className="text-xs text-base-content/80">
                        {g.message.replace("Daily limit reached — ", "→ ")}
                      </div>
                      {acc && <div className="mt-0.5 text-[10px] text-base-content/35">{acc.name}</div>}
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-[10px] text-base-content/35">
                      {formatDateTime(g.created_at)}
                    </div>
                  </div>
                );
              })}
              {data?.guardTrips.length === 0 && (
                <div className="px-5 py-8 text-center text-xs text-base-content/40">
                  No guard trips today
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Warmup Settings Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-base-100 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-base-content">Warmup settings</h2>
                <p className="text-xs text-base-content/40">{editingAccount.name} ({editingAccount.from_email})</p>
              </div>
              <button
                type="button"
                onClick={closeWarmupModal}
                className="rounded-lg p-1 text-base-content/40 hover:bg-base-200 hover:text-base-content transition-colors"
              >
                <RiCloseLine size={20} />
              </button>
            </div>

            {/* Modal Body Form */}
            <div className="space-y-4 p-6">
              {/* Toggle Status */}
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-base-200/40 p-4">
                <div>
                  <div className="text-sm font-medium text-base-content">Enable Warmup</div>
                  <div className="text-xs text-base-content/40">Automatically send & receive peer emails</div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalEnabled(!modalEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${modalEnabled
                      ? "bg-black dark:bg-white"
                      : "bg-neutral-300 dark:bg-neutral-800 border border-[var(--border-subtle)]"
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${modalEnabled
                        ? "translate-x-6 bg-white dark:bg-black"
                        : "translate-x-1 bg-neutral-500 dark:bg-neutral-400"
                      }`}
                  />
                </button>
              </div>

              {/* 1. Daily Ramp Increase */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-base-content/70">
                  Daily Ramp Increase Speed
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={modalRampIncrement}
                    onChange={(e) => setModalRampIncrement(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-base-200/50 px-3 py-2 text-sm text-base-content focus:border-base-content focus:outline-none"
                  />
                  <span className="text-xs text-base-content/40 shrink-0">+ emails / day</span>
                </div>
              </div>

              {/* 2. Max Daily Warmup Limit */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-base-content/70">
                  Max Daily Warmup Limit
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={modalMaxTarget}
                    onChange={(e) => setModalMaxTarget(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-base-200/50 px-3 py-2 text-sm text-base-content focus:border-base-content focus:outline-none"
                  />
                  <span className="text-xs text-base-content/40 shrink-0">emails / day max</span>
                </div>
              </div>

              {/* 3. Target Reply Rate */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-base-content/70">
                  Target Reply Rate
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={80}
                    value={modalReplyRate}
                    onChange={(e) => setModalReplyRate(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-base-200/50 px-3 py-2 text-sm text-base-content focus:border-base-content focus:outline-none"
                  />
                  <span className="text-xs text-base-content/40 shrink-0">%</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] bg-base-200/30 px-6 py-4">
              <button
                type="button"
                onClick={closeWarmupModal}
                className="rounded-xl border border-[var(--border-subtle)] bg-base-100 px-4 py-2 text-xs font-medium text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingModal}
                onClick={saveWarmupSettings}
                /* FORCING text colors here with !text-white and !text-black to override global theme bleeds */
                className="rounded-xl bg-black !text-white hover:bg-neutral-800 dark:bg-white dark:!text-black dark:hover:bg-neutral-200 px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {savingModal ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}