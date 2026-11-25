import type { Vector3 } from "three";

import { get_local_player_id, get_player_position } from "../player/player_position_registry";
import { get_pose_buffers, make_sampled_pose } from "./pose_buffer";

// where a player is right now, by session player id, on any engine: the local player from their rig,
// a remote one from their interpolated pose (the same spot their avatar is drawn at). null is the
// shorthand for the local player. world monitors (host-only) and seeks use this so they see, and
// chase, the same player on every engine rather than whoever is local

const scratch_pose = make_sampled_pose();

export const is_local_player = (id: string | null): boolean => id === null || id === get_local_player_id();

export const sample_player_position = (id: string | null, out: Vector3): boolean => {
    if (is_local_player(id)) {
        return get_player_position(out);
    }
    const buffer = get_pose_buffers().get(id!);
    if (!buffer || !buffer.sample(performance.now(), scratch_pose)) {
        return false;
    }
    out.copy(scratch_pose.origin);
    return true;
};

// every remote player we can place (not the local one)
export const remote_player_ids = (): Iterable<string> => get_pose_buffers().keys();
