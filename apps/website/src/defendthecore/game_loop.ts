import type * as hvr from "@hyperlinkvr/web-sdk";



import {
    apply_core_pillar_behaviour,
    core_pillar
} from "./objects/core_pillar";
import { apply_zombot_behaviour, zombot } from "./objects/enemies/zombot";


const h = hyperlinkvr.builders;

const map_markers = await hyperlinkvr.markers.load("map.glb");
const tunnels = Array.from(hyperlinkvr.markers.subset(map_markers, /^tunnel_/).values())
    .map((marker) => marker.transform.position);

let created_core: hvr.builders.EngineObjectCollectionHandle | null = null;

export const create_core = async () => {
    created_core = await new h.EngineObjectDispatchBuilder(core_pillar)
        .create();

    await apply_core_pillar_behaviour(created_core);
}

const spawn_zombot = async () => {
    if (!created_core) {
        console.warn("Cannot spawn zombot: core not created yet");
        return;
    }

    const tunnel_idx = Math.floor(Math.random() * tunnels.length);
    const tunnel_pos = tunnels[tunnel_idx]!;

    const created_zombot = await new h.EngineObjectDispatchBuilder(zombot).set_position(tunnel_pos).create();
    await apply_zombot_behaviour(created_zombot, created_core);
}
