import React, { useState } from "react";
import { RiCloseLine, RiFireLine, RiAlertLine } from "react-icons/ri";

export interface WarmupModalProps {
    emailAccountId: string;
    isOpen: boolean;
    onClose: (saved?: boolean) => void;
    initialSettings?: {
        enabled?: boolean;
        maxDailyTarget?: number;
        rampIncrement?: number;
        startVolume?: number;
        replyRate?: number;
        aiContentEnabled?: boolean;
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
    availablePools?: { id: string; name: string; type?: string }[];
}

export default function WarmupSettingsModal({
    emailAccountId,
    isOpen,
    onClose,
    initialSettings,
    availablePools = [],
}: WarmupModalProps) {
    const [enabled, setEnabled] = useState<boolean>(
        initialSettings?.enabled ?? false
    );
    const [maxDailyTarget, setMaxDailyTarget] = useState<number>(
        initialSettings?.maxDailyTarget ?? 30
    );
    const [rampIncrement, setRampIncrement] = useState<number>(
        initialSettings?.rampIncrement ?? 2
    );
    const [startVolume, setStartVolume] = useState<number>(
        initialSettings?.startVolume ?? 2
    );
    const [replyRate, setReplyRate] = useState<number>(
        initialSettings?.replyRate ?? 45
    );
    const [aiContentEnabled, setAiContentEnabled] = useState(
        initialSettings?.aiContentEnabled ?? true
    );
    
    // Phase 2 Settings
    const [poolId, setPoolId] = useState<string>(initialSettings?.pool_id || "");
    const [timezone, setTimezone] = useState<string>(initialSettings?.timezone || "UTC");
    const [activeHoursStart, setActiveHoursStart] = useState<number>(initialSettings?.active_hours_start ?? 9);
    const [activeHoursEnd, setActiveHoursEnd] = useState<number>(initialSettings?.active_hours_end ?? 18);
    const [jitterMin, setJitterMin] = useState<number>(initialSettings?.send_jitter_min ?? 5);
    const [jitterMax, setJitterMax] = useState<number>(initialSettings?.send_jitter_max ?? 25);
    const [rampType, setRampType] = useState<string>(initialSettings?.ramp_type || "linear");
    const [customRampCaps, setCustomRampCaps] = useState<string>(
        initialSettings?.custom_ramp_caps ? JSON.parse(initialSettings.custom_ramp_caps).join(", ") : ""
    );
    const [aiProvider, setAiProvider] = useState<string>(initialSettings?.ai_provider || "openrouter");
    const [aiPromptTemplate, setAiPromptTemplate] = useState<string>(initialSettings?.ai_prompt_template || "casual");
    const [customAiKey, setCustomAiKey] = useState<string>("");

    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSave = async (forceResume = false) => {
        setSaving(true);
        try {
            let parsedCaps: number[] | null = null;
            if (rampType === "custom" && customRampCaps) {
                parsedCaps = customRampCaps.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            }

            const res = await fetch("/api/platform/deliverability", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "configure_warmup",
                    email_account_id: emailAccountId,
                    enabled: forceResume ? true : enabled,
                    daily_target: maxDailyTarget,
                    max_daily_target: maxDailyTarget,
                    ramp_increment: rampIncrement,
                    start_volume: startVolume,
                    reply_rate: replyRate,
                    ai_content_enabled: aiContentEnabled,
                    pool_id: poolId || null,
                    timezone,
                    active_hours_start: activeHoursStart,
                    active_hours_end: activeHoursEnd,
                    send_jitter_min: jitterMin,
                    send_jitter_max: jitterMax,
                    ramp_type: rampType,
                    custom_ramp_caps: parsedCaps,
                    ai_provider: aiProvider,
                    ai_prompt_template: aiPromptTemplate,
                    custom_ai_key: customAiKey || undefined,
                    reset_circuit_breaker: forceResume
                }),
            });

            if (res.ok) {
                onClose(true);
            } else {
                const data = (await res.json().catch(() => null)) as { error?: string } | null;
                alert(data?.error || "Failed to update warmup settings");
            }
        } catch {
            alert("Error saving settings");
        } finally {
            setSaving(false);
        }
    };

    const handleNumChange = (
        setter: React.Dispatch<React.SetStateAction<number>>,
        rawVal: string,
        max: number
    ) => {
        const cleaned = rawVal.replace(/\D/g, "");
        if (cleaned === "") {
            setter(0);
            return;
        }
        const val = parseInt(cleaned, 10);
        setter(val > max ? max : val);
    };

    const inputClassName =
        "w-full !rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 px-4 py-2.5 text-sm text-neutral-900 dark:text-white transition-colors focus:border-neutral-400 dark:focus:border-neutral-600 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0";

    const fixedRadiusStyle: React.CSSProperties = {
        borderRadius: "16px",
        outline: "none",
        boxShadow: "none",
    };

    const isCircuitBreakerPaused = !enabled && initialSettings?.paused_reason;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-2xl my-auto max-h-[85vh] overflow-y-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-2xl relative">

                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md px-6 py-4">
                    <div className="flex items-center gap-2">
                        <RiFireLine size={18} className="text-neutral-500 dark:text-neutral-400" />
                        <h3 className="text-sm font-semibold">Enterprise Warmup Settings</h3>
                    </div>
                    <button
                        type="button"
                        onClick={() => onClose()}
                        className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                    >
                        <RiCloseLine size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="space-y-6 p-6">
                    {/* Circuit Breaker Banner */}
                    {isCircuitBreakerPaused && (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50">
                            <div className="flex items-start gap-3">
                                <RiAlertLine className="text-orange-500 mt-0.5" size={20} />
                                <div>
                                    <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-300">Warmup Auto-Paused</h4>
                                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">{initialSettings.paused_reason}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleSave(true)}
                                disabled={saving}
                                className="whitespace-nowrap rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                            >
                                Reset & Resume Warmup
                            </button>
                        </div>
                    )}

                    {/* Enable Warmup master toggle */}
                    <div className="flex items-center justify-between rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-4">
                        <div>
                            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                                Enable Campaign Warmup
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                                Warmup this inbox on a controlled schedule.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEnabled(!enabled)}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled
                                    ? "bg-neutral-900 dark:bg-white"
                                    : "bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700"
                                }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full transition-transform ${enabled
                                        ? "translate-x-6 bg-white dark:bg-neutral-900"
                                        : "translate-x-1 bg-neutral-500 dark:bg-neutral-400"
                                    }`}
                            />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-100 transition-opacity" style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? 'auto' : 'none' }}>
                        
                        {/* Column 1: Core Target & Schedule */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Volume & Scheduling</h4>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Max Daily Target (emails)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={maxDailyTarget || ""}
                                    onChange={(e) => handleNumChange(setMaxDailyTarget, e.target.value, 100)}
                                    style={fixedRadiusStyle}
                                    className={inputClassName}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                    <span>Ramp Type</span>
                                </label>
                                <select 
                                    value={rampType} 
                                    onChange={e => setRampType(e.target.value)}
                                    style={fixedRadiusStyle}
                                    className={inputClassName}
                                >
                                    <option value="linear">Linear Increment</option>
                                    <option value="custom">Custom Caps</option>
                                </select>
                            </div>

                            {rampType === "linear" ? (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Daily Ramp-Up Speed (+ emails/day)</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={rampIncrement || ""}
                                        onChange={(e) => handleNumChange(setRampIncrement, e.target.value, 20)}
                                        style={fixedRadiusStyle}
                                        className={inputClassName}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Custom Caps Array</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 2, 5, 10, 15, 20"
                                        value={customRampCaps}
                                        onChange={e => setCustomRampCaps(e.target.value)}
                                        style={fixedRadiusStyle}
                                        className={inputClassName}
                                    />
                                    <p className="text-[10px] text-neutral-500">Comma separated targets per day active.</p>
                                </div>
                            )}

                            <div className="space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Timezone</label>
                                <select 
                                    value={timezone} 
                                    onChange={e => setTimezone(e.target.value)}
                                    style={fixedRadiusStyle}
                                    className={inputClassName}
                                >
                                    <option value="UTC">UTC</option>
                                    <option value="America/New_York">Eastern Time (US)</option>
                                    <option value="America/Chicago">Central Time (US)</option>
                                    <option value="America/Denver">Mountain Time (US)</option>
                                    <option value="America/Los_Angeles">Pacific Time (US)</option>
                                    <option value="Europe/London">London (UK)</option>
                                    <option value="Europe/Paris">Central Europe</option>
                                    <option value="Asia/Kolkata">India Standard Time</option>
                                    <option value="Asia/Singapore">Singapore</option>
                                    <option value="Australia/Sydney">Sydney</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Start Hr (0-23)</label>
                                    <input type="text" inputMode="numeric" value={activeHoursStart} onChange={(e) => handleNumChange(setActiveHoursStart, e.target.value, 23)} style={fixedRadiusStyle} className={inputClassName} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">End Hr (1-24)</label>
                                    <input type="text" inputMode="numeric" value={activeHoursEnd} onChange={(e) => handleNumChange(setActiveHoursEnd, e.target.value, 24)} style={fixedRadiusStyle} className={inputClassName} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Min Jitter (m)</label>
                                    <input type="text" inputMode="numeric" value={jitterMin} onChange={(e) => handleNumChange(setJitterMin, e.target.value, 60)} style={fixedRadiusStyle} className={inputClassName} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Max Jitter (m)</label>
                                    <input type="text" inputMode="numeric" value={jitterMax} onChange={(e) => handleNumChange(setJitterMax, e.target.value, 120)} style={fixedRadiusStyle} className={inputClassName} />
                                </div>
                            </div>
                        </div>

                        {/* Column 2: Pools & AI Controls */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Isolation & Content</h4>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Warmup Pool Selection</label>
                                <select 
                                    value={poolId} 
                                    onChange={e => setPoolId(e.target.value)}
                                    style={fixedRadiusStyle}
                                    className={inputClassName}
                                >
                                    <option value="">Global Platform Pool</option>
                                    {availablePools.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}{p.type ? ` (${p.type})` : ""}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Enable AI Engine</label>
                                    <button
                                        type="button"
                                        onClick={() => setAiContentEnabled(!aiContentEnabled)}
                                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${aiContentEnabled ? "bg-neutral-900 dark:bg-white" : "bg-neutral-300 dark:bg-neutral-700"}`}
                                    >
                                        <span className={`inline-block h-3 w-3 transform rounded-full transition-transform ${aiContentEnabled ? "translate-x-5 bg-white dark:bg-neutral-900" : "translate-x-1 bg-neutral-500 dark:bg-neutral-400"}`} />
                                    </button>
                                </div>
                                {aiContentEnabled && (
                                    <div className="space-y-3 bg-neutral-50/50 dark:bg-neutral-800/30 p-3 rounded-2xl border border-neutral-100 dark:border-neutral-800 mt-2">
                                        
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">AI Provider</label>
                                            <select 
                                                value={aiProvider} 
                                                onChange={e => setAiProvider(e.target.value)}
                                                style={fixedRadiusStyle}
                                                className="w-full !rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-900 dark:text-white transition-colors focus:border-neutral-400 dark:focus:border-neutral-600 focus:outline-none focus:ring-0"
                                            >
                                                <option value="openrouter">OpenRouter (Workspace Default)</option>
                                                <option value="openai">OpenAI (GPT-4o Mini)</option>
                                                <option value="custom_key">Custom API Key</option>
                                            </select>
                                        </div>

                                        {aiProvider === "custom_key" && (
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Custom Key</label>
                                                <input 
                                                    type="password" 
                                                    placeholder="Enter custom API key..."
                                                    value={customAiKey}
                                                    onChange={e => setCustomAiKey(e.target.value)}
                                                    style={fixedRadiusStyle}
                                                    className="w-full !rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-900 dark:text-white transition-colors focus:border-neutral-400 dark:focus:border-neutral-600 focus:outline-none focus:ring-0"
                                                />
                                                <p className="text-[9px] text-green-600 dark:text-green-400">Stored securely using AES-256 encryption.</p>
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Industry Prompt Template</label>
                                            <select 
                                                value={aiPromptTemplate} 
                                                onChange={e => setAiPromptTemplate(e.target.value)}
                                                style={fixedRadiusStyle}
                                                className="w-full !rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-900 dark:text-white transition-colors focus:border-neutral-400 dark:focus:border-neutral-600 focus:outline-none focus:ring-0"
                                            >
                                                <option value="casual">Casual Business (Default)</option>
                                                <option value="b2b_tech">B2B Tech / SaaS</option>
                                                <option value="consulting">Management Consulting</option>
                                                <option value="ecommerce">E-commerce</option>
                                            </select>
                                        </div>

                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/95 dark:bg-neutral-900/95 backdrop-blur-md px-6 py-4 rounded-b-2xl">
                    <button
                        type="button"
                        onClick={() => onClose()}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-2.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSave()}
                        disabled={saving}
                        className="rounded-xl bg-neutral-900 dark:bg-white px-6 py-2.5 text-xs font-semibold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50"
                    >
                        {saving ? "Saving..." : "Save Configuration"}
                    </button>
                </div>

            </div>
        </div>
    );
}