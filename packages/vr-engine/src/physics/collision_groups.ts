import { interactionGroups } from "@react-three/rapier";
import type {CollisionFilter} from "@hyperlinkvr/vr-engine-schemas";

export const GROUP_WORLD = 0;
export const GROUP_PLAYER = 1;
export const GROUP_PROP = 2;

export const PLAYER_COLLISION_GROUPS = interactionGroups(GROUP_PLAYER);

export const WORLD_FILTER_BIT = 1 << GROUP_WORLD;
export const PLAYER_FILTER_BIT = 1 << GROUP_PLAYER;
export const PROP_FILTER_BIT = 1 << GROUP_PROP;


// how long after release we keep ignoring the player, so a receding hand can't bat the object as it turns dynamic again
export const DEFAULT_IGNORE_RELEASE_DELAY_S = 0.25;

// rapier flag
export const EXCLUDE_SENSORS = 8;

export const build_collision_groups = (
    base_membership: number,
    filter: Pick<CollisionFilter, "players" | "props" | "world">
): number => {
    const collides_with: number[] = [];

    if (filter.world !== false) collides_with.push(GROUP_WORLD);
    if (filter.players !== false) collides_with.push(GROUP_PLAYER);
    if (filter.props !== false) collides_with.push(GROUP_PROP);

    return interactionGroups(base_membership, collides_with);
};
