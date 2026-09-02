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

    hyperlinkvr.finished_loading();
});

(globalThis as any).make_zombot = async () => {
    const created_zombot = await new h.EngineObjectDispatchBuilder(zombot).set_position(0, 0, 5).create();
    await apply_zombot_behaviour(created_zombot, created_core);
}
