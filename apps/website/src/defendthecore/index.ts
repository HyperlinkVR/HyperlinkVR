import {
    apply_core_pillar_behaviour,
    core_pillar
} from "./objects/core_pillar";
import { apply_zombot_behaviour, zombot } from "./objects/enemies/zombot";

import type * as hvr from "@hyperlinkvr/web-sdk";

const h = hyperlinkvr.builders;

let created_core: hvr.builders.EngineObjectCollectionHandle | null = null;

hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();

    const map = new h.CustomObjectBuilder()
        .set_mesh("map.glb")
        .set_physics(new h.PhysicsSystemBuilder()
            .set_rigid_body(
                new h.FixedRigidBodyBuilder()
                    .set_collider(new h.ColliderBuilder().auto("trimesh").build())
                    .build()
            )
            .build()
        )
        .build();

    await new h.EngineObjectDispatchBuilder(map)
        .create();

    await new h.WorldEnvBuilder()
        .set_sky(new h.WorldSkyBuilder()
            .set_sky_zenith_color(0x010814)
            .set_sky_horizon_color(0x010814)
            .set_ground_horizon_color(0x010814)
            .set_ground_nadir_color(0x010814)
            .set_sun_direction([0, 1, 0])
            .set_sun_size(0)
            .set_sun_glow(0)
            .build()
        )
        .apply();

    await new h.VFXStackBuilder()
        .bloom({strength: 0.5})
        .apply();

    created_core = await new h.EngineObjectDispatchBuilder(core_pillar)
        .set_position(0, 0, -5)
        .create();
    await apply_core_pillar_behaviour(created_core);

    const map_markers = await hyperlinkvr.markers.load("map.glb");
    const tunnels = Array.from(hyperlinkvr.markers.subset(map_markers, /^tunnel_/).values()).map(marker => marker.transform.position);

    hyperlinkvr.finished_loading();

    setInterval(async () => {
        const tunnel_idx = Math.floor(Math.random() * tunnels.length);
        const tunnel_pos = tunnels[tunnel_idx]!;

        const created_zombot = await new h.EngineObjectDispatchBuilder(zombot).set_position(tunnel_pos).create();
        await apply_zombot_behaviour(created_zombot, created_core!);
    }, 5000);
});
