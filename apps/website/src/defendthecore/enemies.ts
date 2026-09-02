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
    attack_core: { text: "\\(°_o)/", color: 0xaae4ff }
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

export const apply_zombot_behaviour = async (created_zombot: hvr.builders.EngineObjectCollectionHandle) => {
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

    let ongoing_seek: hvr.builders.SeekHandle | null = null;
    let in_range = 0;

    const monitor_name = `proximity-${created_zombot.object.id}`;

    // change face and behaviour based when distance to a player is less than 3 units
    hyperlinkvr.world.add_monitor(
        monitor_name,

        new h.DistanceMonitorBuilder()
            .from(created_zombot)
            .to(h.any_player())
            // will activate when a player is closer than 4 units, and deactivate when the player is farther than 8 units (4 + 4 hysteresis)
            .closer_than(4)
            .hysteresis(4)
            .build(),

        async (event) => {
            if (event.kind !== "distance-monitor") {
                return;
            }

            const player = event.payload.b;
            if (player.kind !== "player") {
                return;
            }

            if (event.payload.type === "enter") {
                in_range++;

                change_face("fighter");

                if (ongoing_seek) {
                    ongoing_seek.stop();
                }

                // seek player
                ongoing_seek = await created_zombot
                    .seek()
                    .speed(1)
                    .set_distance(1)
                    .toward_player(player.username)
                    .start();
            } else if (event.payload.type === "exit") {
                in_range--;

                if (in_range <= 0) {
                    change_face("neutral");
                    in_range = 0;

                    if (ongoing_seek) {
                        ongoing_seek.stop();
                        ongoing_seek = null;
                    }
                }
            }
        }
    );
}
