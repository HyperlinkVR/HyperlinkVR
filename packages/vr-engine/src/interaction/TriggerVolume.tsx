import type {Collider, TriggerVolumeInteractionPayload} from "@hyperlinkvr/vr-engine-schemas";
import {
    IntersectionEnterPayload, IntersectionExitPayload,
    RapierRigidBody,
    RigidBody,
} from "@react-three/rapier";
import {ComponentProps, useMemo, useRef} from "react";
import {Euler, EulerOrder, Group, Quaternion, Vector3} from "three";

import {get_collider_extents, useCollider, useKinematicPosition} from "../engine/ObjectPhysics";
import {rotation_to_euler} from "../engine/rotation";
import {resolve_object_node} from "./util/target_resolution";
import {collect_tags} from "../util/tags";


interface TriggerVolumeProps extends ComponentProps<"group"> {
    collider: Collider;
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

    const collider_rot_euler = useMemo(() => {
        if (!collider.rotation) return [0, 0, 0] as [number, number, number];

        const euler = new Euler();
        rotation_to_euler(collider.rotation, euler);
        return [euler.x, euler.y, euler.z, euler.order] as [number, number, number, EulerOrder];
    }, [collider.rotation]);

    return (
        <group {...rest}>
            <RigidBody
                ref={rb_ref}
                // @ts-ignore
                type="kinematicPosition"
                sensor
                onIntersectionEnter={on_enter}
                onIntersectionExit={on_exit}
                activeCollisionTypes={ALL_COLLISIONS}
                colliders={auto_strategy}
            >
                {ColliderComponent && <ColliderComponent position={collider.offset} rotation={collider_rot_euler} />}
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
