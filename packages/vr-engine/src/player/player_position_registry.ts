import type { Group, Vector3 } from "three";

// the seek runner (and anything else needing the local player's position every
// frame) reads it synchronously from here, rather than the async
// HVRSDK_PLAYER_GET_POSITION round trip the SDK uses. the Player component
// registers its origin group on mount.
//
// TODO: multiplayer. this only tracks the local player's origin; a host-oriented
// player registry keyed by username slots in behind get_player_position later.
let local_origin: Group | null = null;

export const set_local_player_origin = (origin: Group | null) => {
    local_origin = origin;
};

// writes the local player's world position into `out`, returning false if the
// rig isn't mounted yet (so a caller can skip this frame)
export const get_player_position = (out: Vector3): boolean => {
    if (!local_origin) return false;
    local_origin.getWorldPosition(out);
    return true;
};
