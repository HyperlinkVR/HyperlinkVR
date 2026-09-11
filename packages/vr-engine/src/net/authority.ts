// who simulates what, so the engine code asks "is this simulated here", never "is this multiplayer"

// object id -> peer simulating it, anything absent is simulated here
const remote_simulators = new Map<string, string>();

// world-level work (world monitors) belongs to the host, or us when solo
let world_authority = true;

export const is_simulated_locally = (object_id: string): boolean => !remote_simulators.has(object_id);

export const has_world_authority = (): boolean => world_authority;

// null hands the object back to this engine
export const set_remote_simulator = (object_id: string, peer_id: string | null) => {
    if (peer_id === null) {
        remote_simulators.delete(object_id);
    } else {
        remote_simulators.set(object_id, peer_id);
    }
};

export const set_world_authority = (authoritative: boolean) => {
    world_authority = authoritative;
};

export const reset_authority = () => {
    remote_simulators.clear();
    world_authority = true;
};
