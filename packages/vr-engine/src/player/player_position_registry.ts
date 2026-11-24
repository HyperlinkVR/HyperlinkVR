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

// the local player's id (useLocalPlayerId; null only before the Player mounts). reports are stamped with this so the
// host's page can attribute who caused them (e.player). a client's forwarded reports carry its own
// id; the host's own reports carry the host's.
let local_player_id: string | null = null;

export const set_local_player_id = (id: string | null) => {
    local_player_id = id;
};

export const get_local_player_id = (): string | null => local_player_id;

// writes the local player's world position into `out`, returning false if the
// rig isn't mounted yet (so a caller can skip this frame)
export const get_player_position = (out: Vector3): boolean => {
    if (!local_origin) return false;
    local_origin.getWorldPosition(out);
    return true;
};

// bumped whenever the world places the player (HVRSDK_PLAYER_TELEPORT_TO), so PlayerKinematics can
// treat it as a placement rather than movement: drop any fall speed built up before it, and make the
// target the fall-reset point
let teleport_seq = 0;

export const mark_player_teleported = () => {
    teleport_seq++;
};

export const get_player_teleport_seq = () => teleport_seq;
