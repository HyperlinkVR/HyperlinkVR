import type { Interacted } from "@hyperlinkvr/vr-engine-schemas";

// remote players' collision capsules (RemoteAvatar), by collider handle → peer id. they're created
// directly in rapier rather than through a RigidBody component, so nothing else can name them: the
// character controller asks here whether a collider is another player (to apply the world's
// player_collisions setting), and raycasts ask whose body they hit

const capsules = new Map<number, string>();

export const register_remote_capsule = (collider_handle: number, peer_id: string) => {
    capsules.set(collider_handle, peer_id);
    return () => {
        if (capsules.get(collider_handle) === peer_id) {
            capsules.delete(collider_handle);
        }
    };
};

export const is_remote_capsule = (collider_handle: number): boolean => capsules.has(collider_handle);

// a raycast hit on a remote capsule is a hit on that player's body
export const remote_capsule_target = (collider_handle: number): Interacted | null => {
    const peer_id = capsules.get(collider_handle);
    return peer_id ? { type: "player", part: "torso", player_id: peer_id } : null;
};
