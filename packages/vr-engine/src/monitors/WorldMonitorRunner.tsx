import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import type { ReportEvent, SubjectRef } from "@hyperlinkvr/vr-engine-schemas";
import { WorldMonitorSchema } from "@hyperlinkvr/vr-engine-schemas";
import { Vector3 } from "three";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { get_object_refs } from "../engine/object_ref_registry";
import { get_player_position } from "../player/player_position_registry";
import type { CompiledWorldMonitor } from "./world_monitor_registry";
import {
    get_world_monitor_entries,
    register_world_monitor,
    unregister_world_monitor
} from "./world_monitor_registry";

const scratch_a = new Vector3();
const scratch_b = new Vector3();

// one message per frame regardless of how many monitors fired
const pending_reports: ReportEvent[] = [];

// subjects that cannot resolve (a stale object id, or a remote player before
// multiplayer lands) are silent by design, but the world author should hear once
const warned_subjects = new Set<string>();

const subject_key = (subject: SubjectRef): string =>
    subject.kind === "object" ? `object:${subject.id}` : `player:${subject.username ?? "@local"}`;

// writes the subject's current world position into `out`, returning false when it
// isn't ready to sample (object not mounted yet, or an unsupported remote player)
const resolve_subject = (subject: SubjectRef, out: Vector3): boolean => {
    if (subject.kind === "player") {
        // only the local player has a position source today; the registry has a
        // TODO for a host-keyed lookup that slots in behind get_player_position
        if (subject.username !== null) {
            return false;
        }
        return get_player_position(out);
    }

    const refs = get_object_refs(subject.id)?.current;
    if (!refs) {
        return false;
    }

    const body = refs.rigid_body.current;
    if (body) {
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

// separation between the two sampled points, restricted to the monitor's plane
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

        return () => {
            off_add();
            off_remove();
        };
    }, [on_action]);

    const tick = useCallback(() => {
        const entries = get_world_monitor_entries();
        if (entries.length === 0 || !connected_ref.current) {
            return;
        }

        const now = performance.now();

        for (const entry of entries) {
            // a pair is only sampled when both ends resolve this frame; a missing
            // end leaves was_inside untouched so no phantom leave fires
            if (!resolve_subject(entry.a, scratch_a)) {
                warn_missing(entry.a);
                continue;
            }
            if (!resolve_subject(entry.b, scratch_b)) {
                warn_missing(entry.b);
                continue;
            }

            const distance = separation(entry, scratch_a, scratch_b);

            // hysteresis widens the window once inside, so a distance parked on the
            // edge doesn't flip-flop between enter and leave every frame
            const inside = entry.was_inside
                ? distance >= entry.min - entry.hysteresis && distance <= entry.max + entry.hysteresis
                : distance >= entry.min && distance <= entry.max;

            const entered = inside && !entry.was_inside;
            const left = !inside && entry.was_inside;
            entry.was_inside = inside;

            if (entered && entry.report_enter) {
                pending_reports.push(make_report(entry.source_id, "enter", distance, now));
            } else if (left && entry.report_leave) {
                pending_reports.push(make_report(entry.source_id, "leave", distance, now));
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

const warn_missing = (subject: SubjectRef) => {
    const key = subject_key(subject);
    if (warned_subjects.has(key)) {
        return;
    }
    warned_subjects.add(key);
    console.warn(`World monitor subject ${key} could not be resolved, skipping until it is available`);
};

const make_report = (
    source_id: string,
    type: "enter" | "leave",
    distance: number,
    ts: number
): ReportEvent =>
    ({
        source_id,
        // world monitors have no owning object; routing is by source_id
        object_id: "",
        kind: "distance-monitor",
        ts,
        payload: { type, distance }
    }) as ReportEvent;
