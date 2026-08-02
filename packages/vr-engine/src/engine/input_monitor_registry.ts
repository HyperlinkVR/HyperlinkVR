import {PlayerMonitor, ButtonSource, AxisSource} from "@hyperlinkvr/vr-engine-schemas";

export interface CompiledButtonMonitor {
    entry_type: "button";
    subject_id: string;
    source_id: string;
    source: ButtonSource;
    report_press: boolean;
    report_release: boolean;
    hold_seconds: number | null;

    // edge state lives on the entry so the tick never does a map lookup
    was_pressed: boolean;
    pressed_since_ms: number;
    hold_fired: boolean;
}

export interface CompiledAxisMonitor {
    entry_type: "axis";
    subject_id: string;
    source_id: string;
    source: AxisSource;
    min_change_delta: number;
    min_interval_ms: number;
    report_settle: boolean;

    last_emit_ms: number;
    has_emitted: boolean;
    last_x: number;
    last_y: number;
    was_settled: boolean;
}

export type CompiledInputMonitor = CompiledButtonMonitor | CompiledAxisMonitor;

// input monitors are added and removed one at a time over rtc, so the primary key is the source id rather than the subject
const by_source_id = new Map<string, CompiledInputMonitor>();

let flattened: CompiledInputMonitor[] = [];

const rebuild_flattened = () => {
    flattened = [...by_source_id.values()];
};

export const get_input_monitor_entries = (): CompiledInputMonitor[] => flattened;

const compile_input_monitor = (
    subject_id: string,
    monitor: PlayerMonitor
): CompiledInputMonitor | null => {
    const source_id = monitor.binding?.id;
    if (!source_id) {
        // no binding means nobody is listening, so polling it would be pure cost
        return null;
    }

    if (monitor.type === "button-input") {
        if (!monitor.report_press && !monitor.report_release && !monitor.report_hold_seconds) {
            console.warn(`Input monitor ${source_id} reports nothing, ignoring`);
            return null;
        }

        return {
            entry_type: "button",
            subject_id,
            source_id,
            source: monitor.source,
            report_press: monitor.report_press,
            report_release: monitor.report_release,
            hold_seconds: monitor.report_hold_seconds ?? null,
            was_pressed: false,
            pressed_since_ms: 0,
            hold_fired: false
        };
    }

    return {
        entry_type: "axis",
        subject_id,
        source_id,
        source: monitor.source,
        min_change_delta: monitor.min_change_delta,
        min_interval_ms: 1000 / monitor.max_report_hz,
        report_settle: monitor.report_settle,
        last_emit_ms: 0,
        has_emitted: false,
        last_x: NaN,
        last_y: NaN,
        was_settled: true
    };
};

// returns false when the monitor was rejected, so the caller can tell the sdk rather than leaving it subscribed to something that will never report
export const register_input_monitor = (
    subject_id: string,
    monitor: PlayerMonitor
): boolean => {
    const entry = compile_input_monitor(subject_id, monitor);
    if (!entry) {
        return false;
    }

    if (by_source_id.has(entry.source_id)) {
        console.warn(`Input monitor ${entry.source_id} is already registered, replacing it`);
    }

    by_source_id.set(entry.source_id, entry);
    rebuild_flattened();
    return true;
};

export const unregister_input_monitor = (source_id: string): boolean => {
    const removed = by_source_id.delete(source_id);
    if (removed) {
        rebuild_flattened();
    }
    return removed;
};

// a world change tears down the scene, and any monitor left behind would keep polling an input whose sdk-side subscriber is long gone
export const clear_input_monitors = (subject_id?: string) => {
    if (subject_id === undefined) {
        by_source_id.clear();
    } else {
        for (const [source_id, entry] of by_source_id) {
            if (entry.subject_id === subject_id) {
                by_source_id.delete(source_id);
            }
        }
    }

    rebuild_flattened();
};