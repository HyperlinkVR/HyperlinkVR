import type * as hvr from "@hyperlinkvr/web-sdk";
import { create_core } from "./game_loop";

const h = hyperlinkvr.builders;

hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();

    const promises = [];

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

    promises.push(
        new h.EngineObjectDispatchBuilder(map)
            .create()
    );

    promises.push(
        new h.WorldEnvBuilder()
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
            .apply()
    );

    promises.push(
        new h.VFXStackBuilder()
            .bloom({strength: 0.5})
            .apply()
    );

    promises.push(create_core());

    await Promise.all(promises);

    hyperlinkvr.finished_loading();
});

hyperlinkvr.players.on_spawn(async (player) => {
    player.teleport_to([0, 1.5, 5]);
});
