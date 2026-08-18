import type { CollisionFilter } from "@hyperlinkvr/vr-engine-schemas";

// rapier flags
const COMPUTE_IMPULSE = 1;
const EMPTY = 0;

interface ColliderCollisionInfo {
    get_tags: () => string[];
    filter: CollisionFilter;
}

const collider_info = new Map<number, ColliderCollisionInfo>();

export const register_collider_collision_info = (handle: number, info: ColliderCollisionInfo) => {
    collider_info.set(handle, info);
    return () => collider_info.delete(handle);
};

export const clear_collider_collision_info = () => collider_info.clear();

// an explicit false on any tag the other body carries rejects the pair
const rejects = (info: ColliderCollisionInfo | undefined, other_tags: string[]): boolean => {
    if (!info?.filter.tags) return false;

    for (const tag of other_tags) {
        if (info.filter.tags[tag] === false) return true;
    }

    return false;
};

// returns EMPTY to pass through, COMPUTE_IMPULSE to collide, null to defer to other hooks
export const filter_contact_pair = (
    collider1: number,
    collider2: number
): number | null => {
    const info_a = collider_info.get(collider1);
    const info_b = collider_info.get(collider2);

    if (!info_a && !info_b) return null;

    if (rejects(info_a, info_b?.get_tags() ?? [])) return EMPTY;
    if (rejects(info_b, info_a?.get_tags() ?? [])) return EMPTY;

    return COMPUTE_IMPULSE;
};
