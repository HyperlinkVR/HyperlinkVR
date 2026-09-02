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

const zombot_face_data = {
    neutral: { text: "(•_•)", color: 0xffffff },
    fighter: { text: "(ง'̀-'́)ง", color: 0xff0000 },
    ouch: { text: "(°ロ°)", color: 0xffff00 },
    attack_core: { text: "¯\\(°_o)/¯", color: 0xaae4ff }
} as const;

const zombot_face = new h.FloatingText2DPrefabBuilder()
    .set_text(zombot_face_data.neutral.text)
    .set_color(zombot_face_data.neutral.color)
    .set_font_size(0.2)
    .build();

export const zombot = new h.ObjectCollectionBuilder(zombot_body, zombot_offset)
    .add_child(zombot_face, {
        position: zombot_markers.get("face")!.transform.position
    }, { label: "face" })
    .add_child(zombot_wheels, undefined, { label: "wheels" })
    .build();

export const animate_zombot = async (created_zombot: hvr.builders.EngineObjectCollectionHandle) => {
    const face_idx = created_zombot.children.findIndex(child => child.label === "face");
    const face = created_zombot.children[face_idx]!;

    const change_face = async (face_type: keyof typeof zombot_face_data) => {
        const face_data = zombot_face_data[face_type];
        face.prefab!.set_text!(face_data.text);
        face.prefab!.set_color!(face_data.color);
    }

    (globalThis as any).dev_cheats = {
        ...(globalThis as any).dev_cheats,
        [new Date().toISOString()]: {
            change_face
        }
    };

    const wheels_idx = created_zombot.children.findIndex(child => child.label === "wheels");
    const wheels = created_zombot.children[wheels_idx]!;

    // change face and behaviour based on distance to player
    // TODO: make a scene level monitor that can be used to trigger events based on distance range between entities
    setInterval(async () => {
        const player = hyperlinkvr.players.get_current_player();
        const player_pos = (await player.get_position()).position;

        await created_zombot.refresh();
        const zombot_pos = created_zombot.object.transform.position;

        const distance = Math.sqrt(
            Math.pow(player_pos[0] - zombot_pos[0], 2) +
            Math.pow(player_pos[1] - zombot_pos[1], 2) +
            Math.pow(player_pos[2] - zombot_pos[2], 2)
        );

        if (distance < 3) {
            await change_face("fighter");

            // seek player
            await created_zombot
                .seek()
                .speed(1)
                .set_distance(1)
                .toward_player()
                .start();

            // wheel rotation animation
            await new h.AnimationBuilder()
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
    }, 100);
}
