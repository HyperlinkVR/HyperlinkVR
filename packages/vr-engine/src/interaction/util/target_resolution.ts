import type { Interacted, InteractedPlayer } from "@hyperlinkvr/vr-engine-schemas";
import type { Object3D } from "three";

import { get_local_player_id } from "../../player/player_position_registry";

// remote players' bodies (#25) are named `remote_avatar_<part>_rb[-hand]:<peer id>`. the prefix keeps
// them clear of every `avatar_` check meant for the local player's own body (the character controller,
// zone player detection), and the suffix says whose body it is
export const REMOTE_AVATAR_PREFIX = "remote_";

export const remote_avatar_body_name = (part: "head" | "torso" | "hand-left" | "hand-right", peer_id: string) => {
    const base = part.startsWith("hand") ? `avatar_hand_rb-${part.slice(5)}` : `avatar_${part}_rb`;
    return `${REMOTE_AVATAR_PREFIX}${base}:${peer_id}`;
};

// avatar bodies are identified by the name ObjectPhysics stamps on the rigid body
export const resolve_player_part = (body_name: string): Interacted | null => {
    if (!body_name) return null;

    // a remote player's body: same part naming behind the prefix, their id after the colon
    if (body_name.startsWith(REMOTE_AVATAR_PREFIX)) {
        const separator = body_name.lastIndexOf(":");
        if (separator < 0) return null;
        const part = resolve_local_part(body_name.slice(REMOTE_AVATAR_PREFIX.length, separator));
        return part ? { ...part, player_id: body_name.slice(separator + 1) } : null;
    }

    const part = resolve_local_part(body_name);
    if (!part) return null;
    const local_id = get_local_player_id();
    return local_id ? { ...part, player_id: local_id } : part;
};

const resolve_local_part = (body_name: string): InteractedPlayer | null => {
    if (body_name.startsWith("avatar_head_rb")) return { type: "player", part: "head" };
    if (body_name.startsWith("avatar_torso_rb")) return { type: "player", part: "torso" };

    if (body_name.startsWith("avatar_hand_rb")) {
        const handedness = body_name.includes("left")
            ? "left"
            : body_name.includes("right")
                ? "right"
                : null;

        if (!handedness) return null;
        return { type: "player", part: "hand", handedness };
    }

    return null;
};

// climbs until it finds the node carrying object_id, rather than assuming a fixed depth from the rigid body
// TODO: TriggerVolume.resolve_interacted should be rewritten onto this and its parent.parent walk deleted
export const resolve_object_node = (start: Object3D | null): Object3D | null => {
    let node: Object3D | null = start;

    while (node) {
        if (typeof node.userData?.object_id === "string") return node;
        node = node.parent;
    }

    return null;
};

export const resolve_hit_target = (
    rigid_body_object: Object3D | null,
    body_name?: string
): Interacted | null => {
    const player = resolve_player_part(body_name ?? rigid_body_object?.name ?? "");
    if (player) return player;

    const object_node = resolve_object_node(rigid_body_object);
    if (!object_node) return null;

    return {
        type: "object",
        object_id: object_node.userData.object_id as string,
        tags: (object_node.userData.tags as string[] | undefined) ?? []
    };
};

export const target_key = (target: Interacted | null): string | null => {
    if (!target) return null;
    if (target.type === "object") return `object:${target.object_id}`;
    return `player:${target.part}:${target.type === "player" && target.part === "hand" ? target.handedness : ""}`;
};
