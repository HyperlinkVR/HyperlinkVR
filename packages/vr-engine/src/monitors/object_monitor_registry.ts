import type { AxisRange, ObjectMonitor } from "@hyperlinkvr/vr-engine-schemas";

export type MonitorReportKind =
    | "pos-monitor"
    | "rot-monitor"
    | "lin-vel-monitor"
    | "ang-vel-monitor";

const REPORT_KIND: Record<ObjectMonitor["type"], MonitorReportKind> = {
    position: "pos-monitor",
    rotation: "rot-monitor",
    "linear-velocity": "lin-vel-monitor",
    "angular-velocity": "ang-vel-monitor"
};

// tolerance used to turn an equals range into a window, since exact float equality is never going to work in practice with physics
const EQUALS_EPSILON = 1e-4;

export const AXIS_BIT = { x: 1, y: 2, z: 4 } as const;

export interface AxisWindow {
    active: boolean;
    min: number;
    max: number;
}

const INACTIVE_WINDOW: AxisWindow = { active: false, min: -Infinity, max: Infinity };

// convert to always be range, so no need to check for equals in the actual ticking
const compile_axis = (range: AxisRange | undefined): AxisWindow => {
    if (!range) {
        return { ...INACTIVE_WINDOW };
    }

    if ("equals" in range) {
        return {
            active: true,
            min: range.equals - EQUALS_EPSILON,
            max: range.equals + EQUALS_EPSILON
        };
    }

    return {
        active: true,
        min: "min" in range ? range.min : -Infinity,
        max: "max" in range ? range.max : Infinity
    };
};

export interface CompiledMonitor {
    object_id: string;
    source_id: string;
    kind: MonitorReportKind;
    monitor_type: ObjectMonitor["type"];

    when: "any" | "all" | "xor";

    continuous: boolean;
    ignore_unchanged: boolean;
    min_change_delta: number;

    windows: { x: AxisWindow; y: AxisWindow; z: AxisWindow };
    active_axis_count: number;

    // mutable tick state lives on the entry itself so the loop never has to do a map lookup to find out what happened last tick
    was_inside: boolean;
    last_emit_ms: number;
    has_emitted: boolean;
    last_x: number;
    last_y: number;
    last_z: number;
}

const compile_monitor = (object_id: string, monitor: ObjectMonitor): CompiledMonitor | null => {
    const source_id = monitor.binding?.id;
    if (!source_id) {
        // no binding means nobody is listening, so it would be pure cost
        return null;
    }

    const windows = {
        x: compile_axis(monitor.x),
        y: compile_axis(monitor.y),
        z: compile_axis(monitor.z)
    };

    const active_axis_count =
        (windows.x.active ? 1 : 0) + (windows.y.active ? 1 : 0) + (windows.z.active ? 1 : 0);

    if (active_axis_count === 0) {
        console.warn(`Monitor ${source_id} on object ${object_id} constrains no axes, ignoring`);
        return null;
    }

    return {
        object_id,
        source_id,
        kind: REPORT_KIND[monitor.type],
        monitor_type: monitor.type,
        when: monitor.when,
        continuous: monitor.continuous?.enabled ?? false,
        ignore_unchanged: monitor.continuous?.ignored_unchanged ?? true,
        min_change_delta: monitor.continuous?.min_change_delta ?? 0,
        windows,
        active_axis_count,
        was_inside: false,
        last_emit_ms: 0,
        has_emitted: false,
        last_x: NaN,
        last_y: NaN,
        last_z: NaN
    };
};

const by_object = new Map<string, CompiledMonitor[]>();

let flattened: CompiledMonitor[] = [];

const rebuild_flattened = () => {
    const next: CompiledMonitor[] = [];
    for (const entries of by_object.values()) {
        next.push(...entries);
    }
    flattened = next;
};

export const get_monitor_entries = (): CompiledMonitor[] => flattened;

export const register_object_monitors = (
    object_id: string,
    monitors: ObjectMonitor[] | undefined
): (() => void) => {
    // if the object already had monitors, carry over the mutable state so that the next tick doesn't see a false transition
    const previous = by_object.get(object_id);
    const previous_state = new Map<string, CompiledMonitor>();
    if (previous) {
        for (const entry of previous) {
            previous_state.set(entry.source_id, entry);
        }
    }

    const compiled: CompiledMonitor[] = [];
    for (const monitor of monitors ?? []) {
        const entry = compile_monitor(object_id, monitor);
        if (!entry) {
            continue;
        }

        const carried = previous_state.get(entry.source_id);
        if (carried) {
            entry.was_inside = carried.was_inside;
            entry.last_emit_ms = carried.last_emit_ms;
            entry.has_emitted = carried.has_emitted;
            entry.last_x = carried.last_x;
            entry.last_y = carried.last_y;
            entry.last_z = carried.last_z;
        }

        compiled.push(entry);
    }

    if (compiled.length === 0) {
        by_object.delete(object_id);
    } else {
        by_object.set(object_id, compiled);
    }
    rebuild_flattened();

    return () => {
        by_object.delete(object_id);
        rebuild_flattened();
    };
};

// returns a bitmask of which constrained axes are currently inside their window
export const satisfied_axes = (entry: CompiledMonitor, x: number, y: number, z: number): number => {
    let mask = 0;

    const { x: window_x, y: window_y, z: window_z } = entry.windows;

    if (window_x.active && x >= window_x.min && x <= window_x.max) {
        mask |= AXIS_BIT.x;
    }
    if (window_y.active && y >= window_y.min && y <= window_y.max) {
        mask |= AXIS_BIT.y;
    }
    if (window_z.active && z >= window_z.min && z <= window_z.max) {
        mask |= AXIS_BIT.z;
    }

    return mask;
};

export const mask_is_inside = (entry: CompiledMonitor, mask: number): boolean => {
    const satisfied_count =
        (mask & AXIS_BIT.x ? 1 : 0) + (mask & AXIS_BIT.y ? 1 : 0) + (mask & AXIS_BIT.z ? 1 : 0);

    switch (entry.when) {
        case "all":
            return satisfied_count === entry.active_axis_count;
        case "any":
            return satisfied_count > 0;
        case "xor":
            return satisfied_count === 1;
    }
};

export const mask_to_axes = (mask: number): ("x" | "y" | "z")[] => {
    const axes: ("x" | "y" | "z")[] = [];
    if (mask & AXIS_BIT.x) axes.push("x");
    if (mask & AXIS_BIT.y) axes.push("y");
    if (mask & AXIS_BIT.z) axes.push("z");
    return axes;
};

export const sample_is_unchanged = (
    entry: CompiledMonitor,
    x: number,
    y: number,
    z: number
): boolean =>
    entry.has_emitted &&
    Math.abs(x - entry.last_x) <= entry.min_change_delta &&
    Math.abs(y - entry.last_y) <= entry.min_change_delta &&
    Math.abs(z - entry.last_z) <= entry.min_change_delta;
