import { useFrame } from "@react-three/fiber";
import { useAfterPhysicsStep } from "@react-three/rapier";
import { useCallback, useRef } from "react";
import type { ReportEvent } from "@hyperlinkvr/vr-engine-schemas";
import { Euler, Quaternion, Vector3 } from "three";

import type { ObjectRefsContextType } from "../contexts/ObjectRefsContext";
import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { get_object_refs } from "./object_ref_registry";
import {
    CompiledMonitor,
    get_monitor_entries,
    mask_is_inside,
    mask_to_axes,
    sample_is_unchanged,
    satisfied_axes
} from "./object_monitor_registry";

const scratch_sample = new Vector3();
const scratch_quaternion = new Quaternion();
const scratch_euler = new Euler();

// one message per tick regardless of how many monitors fired via batching
const pending_reports: ReportEvent[] = [];

// writes the monitor values into the output, returning true if successful, false if the object is not ready to be sampled
const sample_into = (
    entry: CompiledMonitor,
    refs: ObjectRefsContextType,
    out: Vector3
): boolean => {
    const body = refs.rigid_body.current;
    const group = refs.root.current;

    switch (entry.monitor_type) {
        case "position": {
            if (body) {
                const translation = body.translation();
                out.set(translation.x, translation.y, translation.z);
                return true;
            }
            if (!group) {
                return false;
            }
            group.getWorldPosition(out);
            return true;
        }

        case "rotation": {
            if (body) {
                const rotation = body.rotation();
                scratch_quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            } else if (group) {
                group.getWorldQuaternion(scratch_quaternion);
            } else {
                return false;
            }

            // axis ranges on a rotation only make sense as euler radians
            scratch_euler.setFromQuaternion(scratch_quaternion);
            out.set(scratch_euler.x, scratch_euler.y, scratch_euler.z);
            return true;
        }

        case "linear-velocity": {
            if (!body) {
                return false;
            }
            const velocity = body.linvel();
            out.set(velocity.x, velocity.y, velocity.z);
            return true;
        }

        case "angular-velocity": {
            if (!body) {
                return false;
            }
            const velocity = body.angvel();
            out.set(velocity.x, velocity.y, velocity.z);
            return true;
        }
    }
};

export const ObjectMonitorRunner = () => {
    const { emit_event, connected } = useWebSDKMessaging();

    const connected_ref = useRef(connected);
    connected_ref.current = connected;

    const emit_ref = useRef(emit_event);
    emit_ref.current = emit_event;

    // want_body splits the work between the two passes
    // body-backed objects are sampled after the physics step (since only rapier affects them)
    // group-backed objects are sampled on the frame (since only the engine/tweens affect them)
    const run_pass = useCallback((want_body: boolean) => {
        const entries = get_monitor_entries();
        if (entries.length === 0 || !connected_ref.current) {
            return;
        }

        const now = performance.now();

        for (const entry of entries) {
            const refs = get_object_refs(entry.object_id);
            if (!refs) {
                continue;
            }

            const has_body = refs.rigid_body.current !== null;
            if (has_body !== want_body) {
                continue;
            }

            if (!sample_into(entry, refs, scratch_sample)) {
                continue;
            }

            const sample_x = scratch_sample.x;
            const sample_y = scratch_sample.y;
            const sample_z = scratch_sample.z;

            const mask = satisfied_axes(entry, sample_x, sample_y, sample_z);
            const inside = mask_is_inside(entry, mask);

            const crossed_in = inside && !entry.was_inside;
            entry.was_inside = inside;

            if (!(entry.continuous ? inside : crossed_in)) {
                continue;
            }

            if (
                entry.ignore_unchanged &&
                sample_is_unchanged(entry, sample_x, sample_y, sample_z)
            ) {
                continue;
            }

            entry.last_emit_ms = now;
            entry.has_emitted = true;
            entry.last_x = sample_x;
            entry.last_y = sample_y;
            entry.last_z = sample_z;

            pending_reports.push({
                source_id: entry.source_id,
                object_id: entry.object_id,
                kind: entry.kind,
                ts: now,
                payload: {
                    axes: mask_to_axes(mask),
                    values: { x: sample_x, y: sample_y, z: sample_z }
                }
            } as ReportEvent);
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
            console.warn("Failed to emit monitor reports", error);
        }

        pending_reports.length = 0;
    }, []);

    useAfterPhysicsStep(() => run_pass(true));
    useFrame(() => run_pass(false));

    return null;
};
