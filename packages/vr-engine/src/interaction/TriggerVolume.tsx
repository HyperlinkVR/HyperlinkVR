import type { Collider, ColliderOrCollection, TriggerVolumeInteractionPayload } from "@hyperlinkvr/vr-engine-schemas";
import { IntersectionEnterPayload, IntersectionExitPayload, RapierRigidBody, RigidBody } from "@react-three/rapier";
import { ComponentProps, useCallback, useMemo, useRef } from "react";
import { Group, Quaternion, Vector3 } from "three";



import { get_collider_extents, useCollider, useKinematicPosition } from "../engine/ObjectPhysics";
import { collect_tags } from "../util/tags";
import { resolve_object_node } from "./util/target_resolution";


interface TriggerVolumeProps extends ComponentProps<"group"> {
    collider: ColliderOrCollection;
    on_enter?: (payload: IntersectionEnterPayload) => void;
    on_exit?: (payload: IntersectionExitPayload) => void;
    anchor_ref?: React.RefObject<Group | null>;
}

const ALL_COLLISIONS = 60943;

export const TriggerVolume = ({collider, on_enter, on_exit, anchor_ref, children, ...rest}: TriggerVolumeProps) => {
    const { auto_strategy, ColliderComponent } = useCollider(collider);
    const container_ref = useRef<Group>(null);
    const rb_ref = useRef<RapierRigidBody>(null);

    useKinematicPosition(rb_ref, { type: "kinematic-pos" }, anchor_ref || container_ref);

    // use ref counting for collider collections in order to treat whole collection as one shared volume
    // the map is keyed by rigid body handle, and the value is the count of how many colliders in the collection are currently intersecting with that rigid body
    const using_count = useMemo(() => collider.type === "collection", [collider.type]);
    const counts = useRef<Map<number, number>>(new Map());

    // exits are batched and deferred until the end of the current microtask to avoid triggering an exit when teleporting between 2 disjoint colliders
    const pending_exits = useRef<Map<number, IntersectionExitPayload>>(new Map());
    const flush_scheduled = useRef(false);

    const schedule_flush = useCallback(() => {
        if (flush_scheduled.current) return;
        flush_scheduled.current = true;

        queueMicrotask(() => {
            flush_scheduled.current = false;

            pending_exits.current.forEach((payload) => on_exit?.(payload));
            pending_exits.current.clear();
        });
    }, [on_exit]);

    const handle_enter = useCallback(
        (payload: IntersectionEnterPayload) => {
            if (!using_count) {
                on_enter?.(payload);
                return;
            }

            const key = payload.other.rigidBody?.handle;
            if (key == null) return;

            // re-entered before its deferred exit flushed, so it never actually left
            if (pending_exits.current.delete(key)) {
                counts.current.set(key, 1);
                return;
            }

            const n = counts.current.get(key) ?? 0;

            if (n === 0) {
                on_enter?.(payload);
            }

            counts.current.set(key, n + 1);
        },
        [on_enter, using_count]
    );

    const handle_exit = useCallback(
        (payload: IntersectionExitPayload) => {
            if (!using_count) {
                on_exit?.(payload);
                return;
            }

            const key = payload.other.rigidBody?.handle;
            if (key == null) return;

            const n = (counts.current.get(key) ?? 0) - 1;

            if (n > 0) {
                counts.current.set(key, n);
                return;
            }

            // count hit zero but defer the real exit until the batch is fully drained
            counts.current.delete(key);
            pending_exits.current.set(key, payload);
            schedule_flush();
        },
        [on_exit, using_count]
    );

    return (
        <group {...rest}>
            <RigidBody
                ref={rb_ref}
                type="kinematicPosition"
                sensor
                onIntersectionEnter={handle_enter}
                onIntersectionExit={handle_exit}
                activeCollisionTypes={ALL_COLLISIONS}
                colliders={auto_strategy}
            >
                {ColliderComponent && <ColliderComponent position={collider.offset} rotation={collider.rotation} />}
                {children}
            </RigidBody>
        </group>
    )
}

type IntersectionPayload = IntersectionEnterPayload | IntersectionExitPayload;

export const resolve_body_part = (payload: IntersectionPayload): {part: "hand" | "torso" | "head" | null, handedness?: "left" | "right"} => {
    const name = payload.other.rigidBodyObject?.name ?? "";
    if (!name) return {part: null};

    if (name.startsWith("avatar_head_rb")) return {part: "head"};
    if (name.startsWith("avatar_torso_rb")) return {part: "torso"};

    if (name.startsWith("avatar_hand_rb")) {
        const handedness = name.includes("left") ? "left" : name.includes("right") ? "right" : null;
        if (handedness) {
            return {part: "hand", handedness};
        }
    }

    return {part: null};
}

interface MiniInteraction {
    ignore_hands?: boolean;
    ignore_head?: boolean;
    ignore_torso?: boolean;
    objects?: {
        include: boolean;
        tag_filter?: string[];
    }
}

export const resolve_interacted = (payload: IntersectionPayload, config: MiniInteraction = {}): TriggerVolumeInteractionPayload["interacted"] | null => {
    const {part, handedness} = resolve_body_part(payload);

    if (part) {
        if (part === "hand" && config.ignore_hands) return null;
        if (part === "head" && config.ignore_head) return null;
        if (part === "torso" && config.ignore_torso) return null;

        if (part === "hand") {
            if (!handedness) {
                throw new Error("Handedness should be defined for hand part");
            }

            return {type: "player", part, handedness};
        } else {
            return {type: "player", part};
        }
    }

    if (config.objects && config.objects.include) {
        const root = resolve_object_node(payload.other.rigidBodyObject ?? null);
        if (!root) return null;

        const object_id = root.userData?.object_id as string | undefined;
        if (!object_id) return null;

        const object_tags = collect_tags(payload.other.rigidBodyObject ?? null);

        const filter = config.objects.tag_filter;
        if (filter) {
            const has_matching_tag = filter.some(tag => object_tags.includes(tag));
            if (!has_matching_tag) return null;
        }

        return {type: "object", object_id, tags: object_tags};
    }

    return null;
}

// detects the rough direction/face the trigger volume was entered from
export const detect_trigger_direction = (payload: IntersectionEnterPayload, source_collider: Collider): {direction: "top" | "bottom" | "side", local_offset: Vector3} | null => {
    const trigger_volume = payload.target.rigidBody;
    const entering_body = payload.other.rigidBody;

    if (!trigger_volume || !entering_body) {
        return null;
    }

    const extents = get_collider_extents(source_collider);
    if (!extents) {
        return null;
    }

    const trigger_pos = trigger_volume.translation();
    const trigger_rot = trigger_volume.rotation();
    const entering_pos = entering_body.translation();

    // get world positions and rotations
    const t_pos = new Vector3(trigger_pos.x, trigger_pos.y, trigger_pos.z);
    const e_pos = new Vector3(entering_pos.x, entering_pos.y, entering_pos.z);
    const t_quat = new Quaternion(trigger_rot.x, trigger_rot.y, trigger_rot.z, trigger_rot.w);

    // transform to world space
    const local_offset = e_pos.sub(t_pos).applyQuaternion(t_quat.invert());

    // get dominant axis
    const abs_x = Math.abs(local_offset.x / extents.x);
    const abs_y = Math.abs(local_offset.y / extents.y);
    const abs_z = Math.abs(local_offset.z / extents.z);

    if (abs_y > abs_x && abs_y > abs_z) {
        // dominant y
        return {direction: local_offset.y > 0 ? "top" : "bottom", local_offset};
    } else {
        // dominant x or z
        return {direction: "side", local_offset};
    }
}
