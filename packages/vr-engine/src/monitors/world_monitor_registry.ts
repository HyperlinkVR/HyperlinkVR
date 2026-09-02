import type { AxisRange, TargetRef, WorldMonitor } from "@hyperlinkvr/vr-engine-schemas";

// tolerance turning an equals range into a window, since exact float equality on
// a physics-driven distance is never going to hold. mirrors the object monitor.
const EQUALS_EPSILON = 1e-4;

export interface CompiledDistanceMonitor {
    source_id: string;
    a: TargetRef;
    b: TargetRef;
    plane: "xyz" | "xz" | "y";

    // the range compiled to an inclusive window, so the tick never re-checks which
    // variant of the range union it was
    min: number;
    max: number;

    report_enter: boolean;
    report_exit: boolean;
    hysteresis: number;

    // edge state per concrete (a, b) pair, keyed by the two subject keys. a wildcard
    // target fans out to many pairs, each of which crosses independently. missing
    // (default) reads as outside, so a pair that first appears in range fires enter.
    pair_inside: Map<string, boolean>;
}

export type CompiledWorldMonitor = CompiledDistanceMonitor;

// world monitors are added and removed one at a time over rtc, keyed by the
// binding id (there's no owning object to key on)
const by_source_id = new Map<string, CompiledWorldMonitor>();

let flattened: CompiledWorldMonitor[] = [];

const rebuild_flattened = () => {
    flattened = [...by_source_id.values()];
};

export const get_world_monitor_entries = (): CompiledWorldMonitor[] => flattened;

// turn the shared min/max/equals range object into an inclusive [min, max] window
const compile_range = (range: AxisRange): { min: number; max: number } => {
    if ("equals" in range) {
        return { min: range.equals - EQUALS_EPSILON, max: range.equals + EQUALS_EPSILON };
    }
    return {
        min: "min" in range ? range.min : -Infinity,
        max: "max" in range ? range.max : Infinity
    };
};

const compile_world_monitor = (monitor: WorldMonitor): CompiledWorldMonitor | null => {
    const source_id = monitor.binding?.id;
    if (!source_id) {
        // no binding means nobody is listening, so polling it would be pure cost
        return null;
    }

    if (!monitor.report_enter && !monitor.report_exit) {
        console.warn(`World monitor ${source_id} reports neither enter nor exit, ignoring`);
        return null;
    }

    const { min, max } = compile_range(monitor.range);

    return {
        source_id,
        a: monitor.a,
        b: monitor.b,
        plane: monitor.plane,
        min,
        max,
        report_enter: monitor.report_enter,
        report_exit: monitor.report_exit,
        hysteresis: monitor.hysteresis,
        pair_inside: new Map()
    };
};

// returns false when the monitor was rejected, so the caller can tell the sdk
// rather than leaving it subscribed to something that will never report
export const register_world_monitor = (monitor: WorldMonitor): boolean => {
    const entry = compile_world_monitor(monitor);
    if (!entry) {
        return false;
    }

    if (by_source_id.has(entry.source_id)) {
        console.warn(`World monitor ${entry.source_id} is already registered, replacing it`);
    }

    by_source_id.set(entry.source_id, entry);
    rebuild_flattened();
    return true;
};

export const unregister_world_monitor = (source_id: string): boolean => {
    const removed = by_source_id.delete(source_id);
    if (removed) {
        rebuild_flattened();
    }
    return removed;
};

// a world change tears down everything, and any monitor left behind would keep
// polling subjects whose sdk-side subscriber is long gone
export const clear_world_monitors = () => {
    by_source_id.clear();
    rebuild_flattened();
};
