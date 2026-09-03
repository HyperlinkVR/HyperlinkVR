import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import type { DistanceMonitorPayload, ReportEvent, SubjectRef, TargetRef } from "@hyperlinkvr/vr-engine-schemas";
import { TriggerSchema, WorldMonitorSchema } from "@hyperlinkvr/vr-engine-schemas";
import { Vector3 } from "three";

import type { ObjectRefsContextType } from "../contexts/ObjectRefsContext";
import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { get_all_object_refs, get_object_refs } from "../engine/object_ref_registry";
import { register_triggers, run_triggers } from "../engine/trigger_registry";
import { get_player_position } from "../player/player_position_registry";
import type { CompiledWorldMonitor } from "./world_monitor_registry";
import {
    get_world_monitor_entries,
    register_world_monitor,
    unregister_world_monitor
} from "./world_monitor_registry";

interface ResolvedSubject {
    ref: SubjectRef;
    pos: Vector3;
    // stable identity used to key per-pair state and to skip self-pairs
    key: string;
}

// one message per frame regardless of how many pairs fired
const pending_reports: ReportEvent[] = [];

// world triggers are dispatched independently of monitors (keyed by their own
// dispatch id) and register into the shared trigger registry keyed on the source
// monitor's binding id, so run_triggers fires them from the monitor tick above
const world_trigger_cleanups = new Map<string, () => void>();

// resolving a target can produce many subjects, so each side gets a growable pool
// of vectors and a reused list, refilled per monitor. one monitor is fully
// processed before the next reuses them.
const pool_a: Vector3[] = [];
const pool_b: Vector3[] = [];
const list_a: ResolvedSubject[] = [];
const list_b: ResolvedSubject[] = [];
// pair keys touched this monitor-tick, so stale pairs (a subject vanished) can be
// dropped without firing a phantom exit
const seen_pairs = new Set<string>();

const take = (pool: Vector3[], index: number): Vector3 =>
    pool[index] ?? (pool[index] = new Vector3());

// writes an object's current world position into `out`, false if not mountable yet
const sample_object = (refs: ObjectRefsContextType, out: Vector3): boolean => {
    const body = refs.rigid_body.current;
    if (body && body.isValid()) {
        const translation = body.translation();
        out.set(translation.x, translation.y, translation.z);
        return true;
    }
    const group = refs.root.current;
    if (!group) {
        return false;
    }
    group.getWorldPosition(out);
    return true;
};

// expands a target into every concrete subject that resolves this frame, writing
// their positions into pooled vectors
const resolve_target = (target: TargetRef, pool: Vector3[], out: ResolvedSubject[]) => {
    out.length = 0;

    const push_object = (id: string, refs: ObjectRefsContextType) => {
        const pos = take(pool, out.length);
        if (!sample_object(refs, pos)) {
            return;
        }
        out.push({ ref: { kind: "object", id }, pos, key: `o:${id}` });
    };

    const push_local_player = () => {
        const pos = take(pool, out.length);
        if (!get_player_position(pos)) {
            return;
        }
        out.push({ ref: { kind: "player", username: null }, pos, key: "p:@local" });
    };

    switch (target.kind) {
        case "object": {
            const refs = get_object_refs(target.id)?.current;
            if (refs) {
                push_object(target.id, refs);
            }
            break;
        }
        case "player": {
            // only the local player has a position source today; remote players
            // slot in behind get_player_position when multiplayer lands
            if (target.username === null) {
                push_local_player();
            }
            break;
        }
        case "any-object": {
            for (const ref of get_all_object_refs()) {
                const cur = ref.current;
                if (cur) {
                    push_object(cur.id, cur);
                }
            }
            break;
        }
        case "any-player": {
            push_local_player();
            break;
        }
        case "any": {
            for (const ref of get_all_object_refs()) {
                const cur = ref.current;
                if (cur) {
                    push_object(cur.id, cur);
                }
            }
            push_local_player();
            break;
        }
    }
};

// separation between two sampled points, restricted to the monitor's plane
const separation = (entry: CompiledWorldMonitor, a: Vector3, b: Vector3): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;

    switch (entry.plane) {
        case "xz":
            return Math.sqrt(dx * dx + dz * dz);
        case "y":
            return Math.abs(dy);
        default:
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
};

// a crossing fires its triggers whether or not an sdk is connected (matching
// interaction reports), and only queues a report for the sdk when there is one
const emit_crossing = (
    source_id: string,
    type: "enter" | "exit",
    distance: number,
    a: SubjectRef,
    b: SubjectRef,
    ts: number,
    connected: boolean
) => {
    const payload: DistanceMonitorPayload = { type, distance, a, b };

    run_triggers(source_id, payload);

    if (connected) {
        pending_reports.push({
            source_id,
            // world monitors have no owning object; routing is by source_id
            object_id: "",
            kind: "distance-monitor",
            ts,
            payload
        } as ReportEvent);
    }
};

export const WorldMonitorRunner = () => {
    const { emit_event, connected, on_action } = useWebSDKMessaging();

    const connected_ref = useRef(connected);
    connected_ref.current = connected;

    const emit_ref = useRef(emit_event);
    emit_ref.current = emit_event;

    useEffect(() => {
        const off_add = on_action("HVRSDK_WORLD_ADD_MONITOR", (message, reply) => {
            const { success, data } = WorldMonitorSchema.safeParse(message.monitor);
            if (!success) {
                console.error("Failed to parse world monitor", message.monitor);
                reply({
                    for: "HVRSDK_WORLD_ADD_MONITOR",
                    error: "Failed to parse world monitor"
                });
                return;
            }

            const registered = register_world_monitor(data);
            if (!registered) {
                reply({
                    for: "HVRSDK_WORLD_ADD_MONITOR",
                    error: "Monitor was rejected: it has no binding id or reports nothing"
                });
                return;
            }

            reply({
                for: "HVRSDK_WORLD_ADD_MONITOR",
                success: true,
                monitor_id: data.binding!.id!
            });
        });

        const off_remove = on_action("HVRSDK_WORLD_REMOVE_MONITOR", (message, reply) => {
            const removed = unregister_world_monitor(message.monitor_id);

            // the sdk drops its own bookkeeping regardless, so an unknown id is
            // reported but not treated as a failure worth retrying
            reply({
                for: "HVRSDK_WORLD_REMOVE_MONITOR",
                success: true,
                was_registered: removed
            });
        });

        const off_add_trigger = on_action("HVRSDK_WORLD_ADD_TRIGGER", (message, reply) => {
            const { success, data } = TriggerSchema.safeParse(message.trigger);
            if (!success) {
                console.error("Failed to parse world trigger", message.trigger);
                reply({
                    for: "HVRSDK_WORLD_ADD_TRIGGER",
                    error: "Failed to parse world trigger"
                });
                return;
            }

            if (!data.source.id) {
                reply({
                    for: "HVRSDK_WORLD_ADD_TRIGGER",
                    error: "Trigger has no resolved source binding id"
                });
                return;
            }

            // a re-add under the same dispatch id replaces the previous registration
            world_trigger_cleanups.get(message.trigger_id)?.();
            world_trigger_cleanups.set(message.trigger_id, register_triggers([data]));

            reply({
                for: "HVRSDK_WORLD_ADD_TRIGGER",
                success: true,
                trigger_id: message.trigger_id
            });
        });

        const off_remove_trigger = on_action("HVRSDK_WORLD_REMOVE_TRIGGER", (message, reply) => {
            const cleanup = world_trigger_cleanups.get(message.trigger_id);
            if (cleanup) {
                cleanup();
                world_trigger_cleanups.delete(message.trigger_id);
            }

            reply({
                for: "HVRSDK_WORLD_REMOVE_TRIGGER",
                success: true,
                was_registered: cleanup !== undefined
            });
        });

        return () => {
            off_add();
            off_remove();
            off_add_trigger();
            off_remove_trigger();
        };
    }, [on_action]);

    const tick = useCallback(() => {
        const entries = get_world_monitor_entries();
        if (entries.length === 0) {
            return;
        }

        // triggers must run even with no sdk connected, so the tick is not gated on
        // the connection; reports are simply not queued while disconnected
        const connected = connected_ref.current;
        const now = performance.now();

        for (const entry of entries) {
            resolve_target(entry.a, pool_a, list_a);
            resolve_target(entry.b, pool_b, list_b);

            if (list_a.length === 0 || list_b.length === 0) {
                continue;
            }

            seen_pairs.clear();

            for (const a of list_a) {
                for (const b of list_b) {
                    // a wildcard on both ends can pair a subject with itself; skip it
                    if (a.key === b.key) {
                        continue;
                    }

                    const pair_key = `${a.key}|${b.key}`;
                    seen_pairs.add(pair_key);

                    const distance = separation(entry, a.pos, b.pos);
                    const was_inside = entry.pair_inside.get(pair_key) ?? false;

                    // hysteresis widens the window once inside, so a distance parked
                    // on the edge doesn't flip-flop between enter and exit each frame
                    const inside = was_inside
                        ? distance >= entry.min - entry.hysteresis &&
                          distance <= entry.max + entry.hysteresis
                        : distance >= entry.min && distance <= entry.max;

                    entry.pair_inside.set(pair_key, inside);

                    const entered = inside && !was_inside;
                    const exited = !inside && was_inside;

                    if (entered && entry.report_enter) {
                        emit_crossing(entry.source_id, "enter", distance, a.ref, b.ref, now, connected);
                    } else if (exited && entry.report_exit) {
                        emit_crossing(entry.source_id, "exit", distance, a.ref, b.ref, now, connected);
                    }
                }
            }

            // forget pairs whose subjects no longer resolve (destroyed / left). we
            // can't measure a distance to something gone, so no exit is fired.
            // TODO: optionally emit an exit for a vanished in-range pair
            if (entry.pair_inside.size !== seen_pairs.size) {
                for (const key of entry.pair_inside.keys()) {
                    if (!seen_pairs.has(key)) {
                        entry.pair_inside.delete(key);
                    }
                }
            }
        }

        if (pending_reports.length === 0) {
            return;
        }

        try {
            emit_ref.current({
                type: "HVRSDK_ENGINE_OBJECT_REPORT_BATCH",
                reports: pending_reports.slice()
            });
        } catch (error) {
            console.warn("Failed to emit world monitor reports", error);
        }

        pending_reports.length = 0;
    }, []);

    // one pass per frame: a pair can mix a physics body and a player, so both are
    // read at frame time. the half-step staleness of a body's pose is negligible
    // against a distance threshold.
    useFrame(tick);

    return null;
};
