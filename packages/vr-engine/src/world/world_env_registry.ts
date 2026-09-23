import type { WorldEnvFull } from "@hyperlinkvr/vr-engine-schemas";

// world-env lives in the SDK provider's React state. this registry bridges it to non-react code:
// the host reads the current value for the late-join snapshot (#13), and a joining client pushes
// the host's value back into the provider. world-env is plain data (colours/numbers), so no asset
// adoption is needed.
let current_env: WorldEnvFull | null = null;
let applier: ((env: WorldEnvFull) => void) | null = null;

export const set_current_world_env = (env: WorldEnvFull | null) => {
    current_env = env;
};

export const get_current_world_env = (): WorldEnvFull | null => current_env;

// the provider registers its setter so a snapshot can drive it
export const register_world_env_applier = (fn: ((env: WorldEnvFull) => void) | null) => {
    applier = fn;
};

export const apply_world_env = (env: WorldEnvFull) => {
    applier?.(env);
};
