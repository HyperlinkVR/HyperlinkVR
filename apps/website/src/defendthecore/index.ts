import type * as hvr from "@hyperlinkvr/web-sdk";



import { create_core, start_game } from "./game_loop";


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

    const start_button = new h.ButtonPrefabBuilder()
        .named("start")
        .set_label("Start")
        .set_body_shading({type: "emissive", emissive_intensity: 1})
        .build();

    await Promise.all(promises);


    let interval_id: NodeJS.Timeout | null = null;
    const created_button =  await new h.EngineObjectDispatchBuilder(start_button)
        .set_position([0, 1.5, 2])
        .on("start", async () => {
            await start_game();
            created_button.destroy();

            if (interval_id) {
                clearInterval(interval_id);
                interval_id = null;
            }
        })
        .create();

    // blink the start button to draw attention to it
    let blink_on = true;
    interval_id = setInterval(() => {
        blink_on = !blink_on;

        // TODO: custom types for each prefab handle
        created_button.prefab.set_body_shading!({type: "emissive", emissive_intensity: blink_on ? 1 : 0});
    }, 1000);

    hyperlinkvr.finished_loading();
});

hyperlinkvr.players.on_spawn(async (player) => {
    player.teleport_to([0, 1.5, 5]);
});
