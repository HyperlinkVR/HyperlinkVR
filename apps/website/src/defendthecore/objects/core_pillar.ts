import type * as hvr from "@hyperlinkvr/web-sdk";

const h = hyperlinkvr.builders;

const core = new h.CustomObjectBuilder()
    .set_mesh("core.glb")
    .add_interaction("light", new h.PointLightInteractionBuilder()
        .set_color(0x35e7e0)
        .set_intensity(5)
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
    .add_child(core, undefined, { label: "core" })
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
            .add_keyframe(4000, [0, 1, 0, 0])
            .build()
        )
        .loops()
        .autoplay()
        .create();
}
