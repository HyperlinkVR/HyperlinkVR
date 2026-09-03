import type * as hvr from "@hyperlinkvr/web-sdk";


import {
    apply_core_pillar_behaviour,
    core_pillar
} from "./objects/core_pillar";


const h = hyperlinkvr.builders;

let created_core: hvr.builders.EngineObjectCollectionHandle | null = null;
let health = 100;

const core_damage_listeners = new Set<(new_health: number) => void>();

export const create_core = async () => {
    created_core = await new h.EngineObjectDispatchBuilder(
        core_pillar
    ).create();

    await apply_core_pillar_behaviour(created_core);
};

export const get_core = () => {
    if (!created_core) {
        throw new Error("Core has not been created yet");
    }

    return created_core;
};

export const damage_core = (amount: number) => {
    health -= amount;
    if (health < 0) {
        health = 0;
    }

    core_damage_listeners.forEach(listener => listener(health));
};

export const get_core_health = () => {
    return health;
};

export const on_core_damaged = (listener: (new_health: number) => void) => {
    core_damage_listeners.add(listener);

    return () => {
        core_damage_listeners.delete(listener);
    };
};
