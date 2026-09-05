import { useMessageEngine } from "@hyperlinkvr/react";
import type { NamedEvent } from "@hyperlinkvr/types";
import { ChevronDown, ChevronRight, CornerDownRight, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SpyEvent = NamedEvent<"HVR_SPY">;

interface SpyEntry extends SpyEvent {
    id: number;
    // when this page received the event, for a stable local clock across sources
    received: number;
}

// keep memory bounded, the oldest entries fall off the top
const MAX_ENTRIES = 2000;

type Kind = "action" | "event" | "reply" | "unknown";

// the message discriminates on which key it carries; we don't assume anything else about it
const kind_of = (message: any): Kind => {
    if (message?.action) return "action";
    if (message?.for) return "reply";
    if (message?.type) return "event";
    return "unknown";
};

const type_of = (message: any): string =>
    message?.action ?? message?.type ?? message?.for ?? "—";

// only the rtc/web-sdk messages carry a correlation id; everything else opts out of pairing
const corr_of = (message: any): string | undefined => {
    const corr = message?.correlation_id;
    return typeof corr === "string" && corr.length > 0 ? corr : undefined;
};

const short_corr = (corr: string): string => corr.slice(0, 6);

// stable colour per correlation id so a request/reply pair reads as a set at a glance
const corr_color = (corr: string): string => {
    let hash = 0;
    for (let i = 0; i < corr.length; i++) hash = (hash * 31 + corr.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360} 70% 65%)`;
};

// from/to can be a role literal, a tab/url pair, or an sdk origin. render a short label.
const endpoint_label = (endpoint: SpyEvent["from"] | SpyEvent["to"]): string => {
    if (endpoint == null) return "—";
    if (typeof endpoint === "string") return endpoint;
    if ("sdk_origin" in endpoint) {
        const origin = endpoint.sdk_origin;
        if (!origin) return "sdk";
        try { return new URL(origin).host; } catch { return origin; }
    }
    if ("url" in endpoint && endpoint.url) {
        try { return new URL(endpoint.url).host; } catch { return endpoint.url; }
    }
    if ("tab" in endpoint && endpoint.tab != null) return `tab ${endpoint.tab}`;
    return "—";
};

const format_time = (ts: number): string => {
    const d = new Date(ts);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const KIND_STYLES: Record<Kind, string> = {
    action: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    event: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    reply: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    unknown: "bg-gray-500/15 text-gray-400 border-gray-500/30"
};

const CONTEXT_STYLES: Record<SpyEvent["context"], string> = {
    backend: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    sdk: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30"
};

const GRID = "grid grid-cols-[6.5rem_3.75rem_minmax(8rem,1.3fr)_3.75rem_minmax(8rem,1.3fr)_6rem_minmax(0,3fr)] gap-2";

const Badge = ({ label, className }: { label: string; className: string }) => (
    <span className={`px-1.5 py-0.5 rounded border text-[0.65rem] font-medium uppercase tracking-wide text-center ${className}`}>
        {label}
    </span>
);

const KindToggle = ({ kind, active, on_toggle }: { kind: Exclude<Kind, "unknown">; active: boolean; on_toggle: () => void }) => (
    <button
        onClick={on_toggle}
        className={`px-2 py-1 rounded border text-xs font-medium uppercase tracking-wide transition ${
            active ? KIND_STYLES[kind] : "bg-transparent text-gray-600 border-gray-700"
        }`}>
        {kind}
    </button>
);

export const DevToolsSpyPage = () => {
    const messenger = useMessageEngine();

    const [entries, setEntries] = useState<SpyEntry[]>([]);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const [context_filter, setContextFilter] = useState<"all" | SpyEvent["context"]>("all");
    const [kinds, setKinds] = useState<Record<"action" | "event" | "reply", boolean>>({
        action: true,
        event: true,
        reply: true
    });
    const [search, setSearch] = useState("");

    const [paused, setPaused] = useState(false);
    const [autoscroll, setAutoscroll] = useState(true);

    // group correlated rows together (request then reply) instead of pure chronology
    const [grouped, setGrouped] = useState(false);
    // when a correlation is selected, its rows are lit and everything else dims
    const [selected_corr, setSelectedCorr] = useState<string | null>(null);

    // the port listener is registered once; it reads the live paused value through a ref
    const paused_ref = useRef(paused);
    useEffect(() => { paused_ref.current = paused; }, [paused]);

    const id_ref = useRef(0);
    const scroll_ref = useRef<HTMLDivElement>(null);

    // holding this port open is what turns spying on in the background (and, via it, the
    // vr-host). closing this window disconnects the port and spying stops automatically.
    // the background funnels every HVR_SPY event down this same port.
    useEffect(() => {
        const channel = messenger.connect<never, SpyEvent>("hvr-spy");

        const unlisten = channel.listen(async (event) => {
            if (event?.type !== "HVR_SPY" || paused_ref.current) return;

            const entry: SpyEntry = { ...event, id: id_ref.current++, received: Date.now() };
            setEntries((prev) => {
                const next = prev.length >= MAX_ENTRIES ? prev.slice(prev.length - MAX_ENTRIES + 1) : prev;
                return [...next, entry];
            });
        });

        return () => { unlisten(); channel.disconnect(); };
    }, [messenger]);

    // stick to the newest row while following the live feed
    useEffect(() => {
        if (autoscroll && scroll_ref.current) {
            scroll_ref.current.scrollTop = scroll_ref.current.scrollHeight;
        }
    }, [entries, autoscroll]);

    // earliest request timestamp per correlation, to stamp replies with a latency
    const request_ts = useMemo(() => {
        const map = new Map<string, number>();
        for (const entry of entries) {
            const corr = corr_of(entry.message);
            if (!corr || kind_of(entry.message) !== "action") continue;
            const prev = map.get(corr);
            if (prev === undefined || entry.ts < prev) map.set(corr, entry.ts);
        }
        return map;
    }, [entries]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return entries.filter((entry) => {
            if (context_filter !== "all" && entry.context !== context_filter) return false;

            const kind = kind_of(entry.message);
            if (kind !== "unknown" && !kinds[kind]) return false;

            if (needle) {
                const haystack = [
                    type_of(entry.message),
                    endpoint_label(entry.from),
                    endpoint_label(entry.to),
                    JSON.stringify(entry.message)
                ].join(" ").toLowerCase();
                if (!haystack.includes(needle)) return false;
            }

            return true;
        });
    }, [entries, context_filter, kinds, search]);

    // in grouped mode, cluster rows by correlation (ordering groups by first appearance,
    // so the log stays roughly chronological) instead of strict per-row time order
    const display = useMemo(() => {
        if (!grouped) return filtered;

        const group_key = (entry: SpyEntry) => corr_of(entry.message) ?? `solo:${entry.id}`;
        const first_seen = new Map<string, number>();
        for (const entry of filtered) {
            const key = group_key(entry);
            if (!first_seen.has(key)) first_seen.set(key, entry.received);
        }

        return [...filtered].sort((a, b) => {
            const fa = first_seen.get(group_key(a))!;
            const fb = first_seen.get(group_key(b))!;
            return fa - fb || a.received - b.received;
        });
    }, [filtered, grouped]);

    // non-lead rows of a correlation group, to thread them under the request in grouped mode
    const child_ids = useMemo(() => {
        const set = new Set<number>();
        if (!grouped) return set;
        const seen = new Set<string>();
        for (const entry of display) {
            const corr = corr_of(entry.message);
            if (!corr) continue;
            if (seen.has(corr)) set.add(entry.id);
            else seen.add(corr);
        }
        return set;
    }, [display, grouped]);

    const toggle_expanded = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    return (
        <main className="w-full h-screen flex flex-col bg-slate-950 text-slate-200 font-sans">
            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-white/10 bg-slate-900/60">
                <h1 className="text-sm font-semibold text-white mr-2">Message Spy</h1>

                {/* context: both in one pane, filtered explicitly */}
                <div className="flex rounded border border-gray-700 overflow-hidden text-xs">
                    {(["all", "backend", "sdk"] as const).map((c) => (
                        <button
                            key={c}
                            onClick={() => setContextFilter(c)}
                            className={`px-2.5 py-1 uppercase tracking-wide transition ${
                                context_filter === c ? "bg-white/15 text-white" : "text-gray-500 hover:text-gray-300"
                            }`}>
                            {c}
                        </button>
                    ))}
                </div>

                <div className="flex gap-1">
                    {(["action", "event", "reply"] as const).map((k) => (
                        <KindToggle
                            key={k}
                            kind={k}
                            active={kinds[k]}
                            on_toggle={() => setKinds((prev) => ({ ...prev, [k]: !prev[k] }))}
                        />
                    ))}
                </div>

                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="filter by type, source, or payload…"
                    className="flex-1 min-w-[12rem] px-2 py-1 rounded border border-gray-700 bg-slate-950 text-xs placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
                />

                {selected_corr && (
                    <button
                        onClick={() => setSelectedCorr(null)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded border text-xs"
                        style={{ color: corr_color(selected_corr), borderColor: corr_color(selected_corr) }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: corr_color(selected_corr) }} />
                        {short_corr(selected_corr)}
                        <span className="text-gray-500">✕</span>
                    </button>
                )}

                <label className="flex items-center gap-1.5 text-xs text-gray-400 select-none">
                    <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
                    Group
                </label>

                <label className="flex items-center gap-1.5 text-xs text-gray-400 select-none">
                    <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />
                    Follow
                </label>

                <button
                    onClick={() => setPaused((p) => !p)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-700 text-xs hover:bg-white/10 transition">
                    {paused ? <Play size={13} /> : <Pause size={13} />}
                    {paused ? "Resume" : "Pause"}
                </button>

                <button
                    onClick={() => { setEntries([]); setExpanded(new Set()); setSelectedCorr(null); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-700 text-xs hover:bg-white/10 transition">
                    <Trash2 size={13} />
                    Clear
                </button>

                <span className="text-xs text-gray-500 tabular-nums">
                    {filtered.length}/{entries.length}
                </span>
            </div>

            {/* column headers */}
            <div className={`${GRID} px-3 py-1.5 border-b border-white/10 text-[0.65rem] uppercase tracking-wider text-gray-500 bg-slate-900/40`}>
                <span>Time</span>
                <span>Ctx</span>
                <span>Source</span>
                <span>Kind</span>
                <span>Type</span>
                <span>Corr</span>
                <span>Payload</span>
            </div>

            {/* log */}
            <div ref={scroll_ref} className="flex-1 overflow-y-auto font-mono text-xs">
                {filtered.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-600 text-sm font-sans">
                        {entries.length === 0 ? "Waiting for messages…" : "No messages match the current filters"}
                    </div>
                ) : (
                    display.map((entry) => {
                        const kind = kind_of(entry.message);
                        const corr = corr_of(entry.message);
                        const is_open = expanded.has(entry.id);
                        const is_child = child_ids.has(entry.id);

                        const request = corr ? request_ts.get(corr) : undefined;
                        const latency = kind === "reply" && request !== undefined ? entry.ts - request : undefined;

                        const dimmed = selected_corr !== null && corr !== selected_corr;
                        const linked = selected_corr !== null && corr === selected_corr;

                        return (
                            <div
                                key={entry.id}
                                className={`border-b border-white/5 transition-opacity ${dimmed ? "opacity-30" : ""} ${linked ? "bg-sky-500/5" : ""}`}
                                style={grouped && corr ? { borderLeft: `2px solid ${corr_color(corr)}` } : undefined}>
                                <button
                                    onClick={() => toggle_expanded(entry.id)}
                                    className={`${GRID} w-full items-center px-3 py-1 text-left hover:bg-white/5 transition`}>
                                    <span className="text-gray-500 tabular-nums">{format_time(entry.received)}</span>
                                    <Badge label={entry.context} className={CONTEXT_STYLES[entry.context]} />
                                    <span className="truncate text-gray-400">
                                        {endpoint_label(entry.from)} <span className="text-gray-600">→</span> {endpoint_label(entry.to)}
                                    </span>
                                    <Badge label={kind} className={KIND_STYLES[kind]} />
                                    <span className="truncate text-white flex items-center gap-1">
                                        {is_child && <CornerDownRight size={12} className="shrink-0 text-gray-600" />}
                                        {is_open ? <ChevronDown size={12} className="shrink-0 text-gray-500" /> : <ChevronRight size={12} className="shrink-0 text-gray-500" />}
                                        {type_of(entry.message)}
                                    </span>
                                    <span className="flex items-center gap-1 min-w-0">
                                        {corr ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedCorr((prev) => prev === corr ? null : corr); }}
                                                className="flex items-center gap-1 truncate hover:underline"
                                                style={{ color: corr_color(corr) }}
                                                title={corr}>
                                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: corr_color(corr) }} />
                                                {short_corr(corr)}
                                            </button>
                                        ) : (
                                            <span className="text-gray-700">—</span>
                                        )}
                                        {latency !== undefined && (
                                            <span className="text-gray-500 tabular-nums shrink-0">+{latency}ms</span>
                                        )}
                                    </span>
                                    <span className="truncate text-gray-500">
                                        {JSON.stringify(entry.message)}
                                    </span>
                                </button>

                                {is_open && (
                                    <pre className="px-3 pb-2 pt-1 overflow-x-auto text-gray-300 whitespace-pre-wrap break-all bg-black/30">
                                        {JSON.stringify(entry.message, null, 2)}
                                    </pre>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </main>
    );
};
