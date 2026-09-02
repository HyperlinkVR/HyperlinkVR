import type * as hvr from "@hyperlinkvr/web-sdk";





const h = hyperlinkvr.builders;

const zombot_offset = {
    position: [0, 0.25, 0] as [number, number, number],
};

const zombot_markers = await hyperlinkvr.markers.load("zombot_body.glb");

const zombot_body = new h.CustomObjectBuilder()
    .set_mesh("zombot_body.glb")
    .set_physics(
        new h.PhysicsSystemBuilder()
            .set_rigid_body(
                new h.KinematicPosRigidBodyBuilder()
                    .set_collider(new h.ColliderBuilder().auto().build())
                    .build()
            )
            .build()
    )
    .build();

const zombot_wheels = new h.CustomObjectBuilder()
    .set_mesh("zombot_wheels.glb")
    .build();

const zombot_face = new h.FloatingText2DPrefabBuilder()
    .set_text("(ง'̀-'́)ง")
    .set_font_size(0.2)
    .set_color(0xff0000)
    .build();

export const zombot = new h.ObjectCollectionBuilder(zombot_body, zombot_offset)
    .add_child(zombot_face, {
        position: zombot_markers.get("face")!.transform.position
    })
    .add_child(zombot_wheels, undefined, { label: "wheels" })
    .build();

export const animate_zombot = async (created_zombot: hvr.builders.EngineObjectCollectionHandle) => {
    const wheels_idx = created_zombot.children.findIndex(child => child.label === "wheels");
    const wheels = created_zombot.children[wheels_idx]!;

    return new h.AnimationBuilder()
        .add_track(h.KeyframeTrackBuilder.rotation(wheels)
            .add_keyframe(0, [0, 0, 0, 1])
            .add_keyframe(250, [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)])
            .add_keyframe(500, [Math.sin(Math.PI / 2), 0, 0, Math.cos(Math.PI / 2)])
            .add_keyframe(750, [Math.sin(3 * Math.PI / 4), 0, 0, Math.cos(3 * Math.PI / 4)])
            .add_keyframe(1000, [Math.sin(Math.PI), 0, 0, Math.cos(Math.PI)])
            .build()
        )
        .loops()
        .autoplay()
        .create();
}
