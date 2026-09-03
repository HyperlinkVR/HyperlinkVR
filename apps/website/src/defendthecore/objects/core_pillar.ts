import type * as hvr from "@hyperlinkvr/web-sdk";

const h = hyperlinkvr.builders;

const core = new h.CustomObjectBuilder()
    .set_mesh("core.glb")
    .add_interaction("light", new h.PointLightInteractionBuilder()
        .set_color(0x35e7e0)
        .set_intensity(5)
        .build()
    )
    .add_interaction("particles", new h.ParticleEmitterInteractionBuilder()
        .set_visual({type: "atlas", url: "spark_atlas.png", alpha: 0.85, u_tile_count: 4, v_tile_count: 1})
        .set_per_second(75)
        .set_lifetime({min: 0.5, max: 1.1})
        .set_speed({min: 0.2, max: 0.6})
        .set_particle_size({min: 0.15, max: 0.35})
        .set_particle_rotation({min: 0, max: Math.PI * 2})
        .set_emitter_shape({type: "sphere", radius: 1.5, thickness: 0.5})
        .set_behaviors([
            {type: "fade-over-life", fade_in_ratio: 0.15, fade_out_ratio: 0.4}
        ])
        .set_color([
            {color: 0x35e7e0, weight: 2},
            {color: 0x35bbe7, weight: 1},
            {color: 0x739ade, weight: 1},
            {color: 0xffffff, weight: 2}
        ])
        .loop()
        .autoplay()
        .build()
    )
    .build();

const pillar = new h.CustomObjectBuilder()
    .set_mesh("pillar.glb")
    .set_physics(new h.PhysicsSystemBuilder()
        .set_rigid_body(
            new h.FixedRigidBodyBuilder()
                .set_collider(new h.ColliderBuilder().auto("trimesh").build())
                .build()
        )
        .build()
    )
    .build();

export const core_pillar = new h.ObjectCollectionBuilder(pillar)
    .add_child(core, {position: [0, 7, 0]}, { label: "core" })
    .build();

export const apply_core_pillar_behaviour = async (created_core_pillar: hvr.builders.EngineObjectCollectionHandle) => {
    const core_idx = created_core_pillar.children.findIndex(child => child.label === "core");
    const core = created_core_pillar.children[core_idx]!;

    // slowly bob core up, down, and rotate
    await new h.AnimationBuilder()
        .add_track(h.KeyframeTrackBuilder.position(core)
            .relative()
            .add_keyframe(0, [0, 0, 0])
            .add_keyframe(1000, [0, 0.1, 0])
            .add_keyframe(2000, [0, 0, 0])
            .add_keyframe(3000, [0, -0.1, 0])
            .add_keyframe(4000, [0, 0, 0])
            .build()
        )
        .add_track(h.KeyframeTrackBuilder.rotation(core)
            .relative()
            .add_keyframe(0, [0, 0, 0, 1])
            .add_keyframe(1000, [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)])
            .add_keyframe(2000, [0, Math.sin(Math.PI / 2), 0, Math.cos(Math.PI / 2)])
            .add_keyframe(3000, [0, Math.sin(3 * Math.PI / 4), 0, Math.cos(3 * Math.PI / 4)])
            .add_keyframe(4000, [0, Math.sin(Math.PI), 0, Math.cos(Math.PI)])
            .build()
        )
        .loops()
        .autoplay()
        .create();
}
