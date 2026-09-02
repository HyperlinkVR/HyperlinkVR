import type * as hvr from "@hyperlinkvr/web-sdk";





const h = hyperlinkvr.builders;

const zombot_offset = {
    position: [0, 0.25, 0] as [number, number, number],
};

const zombot_speed = 0.75;

const zombot_markers = await hyperlinkvr.markers.load("zombot_body.glb");
const face_transform = {
    position: zombot_markers.get("face")!.transform.position
};

const zombot_face_data = {
    neutral: { text: "(•_•)", color: 0xffffff },
    alerted: { text: "!", color: 0xffa500 },
    fighter: { text: "(ง'̀-'́)ง", color: 0xff0000 },
    ouch: { text: "(°ロ°)", color: 0xffff00 },
    attack_core: { text: "\\(°_o)/", color: 0xaae4ff }
} as const;

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
    .add_interaction("light", new h.PointLightInteractionBuilder()
        .set_intensity(0.25)
        .set_offset(face_transform.position)
        .set_color(zombot_face_data.neutral.color)
        .build()
    )
    .build();

const zombot_wheels = new h.CustomObjectBuilder()
    .set_mesh("zombot_wheels.glb")
    .build();

const zombot_face = new h.FloatingText2DPrefabBuilder()
    .set_text(zombot_face_data.neutral.text)
    .set_color(zombot_face_data.neutral.color)
    .set_font_size(0.2)
    .build();

export const zombot = new h.ObjectCollectionBuilder(zombot_body, zombot_offset)
    .add_child(zombot_face, face_transform, { label: "face" })
    .add_child(zombot_wheels, undefined, { label: "wheels" })
    .build();

export const apply_zombot_behaviour = async (created_zombot: hvr.builders.EngineObjectCollectionHandle, created_core: hvr.builders.EngineObjectCollectionHandle) => {
    const face_idx = created_zombot.children.findIndex(child => child.label === "face");
    // TODO: have collections build a lookup table of labels on insertion
    const face = created_zombot.children[face_idx]!;

    const change_face = async (face_type: keyof typeof zombot_face_data) => {
        const face_data = zombot_face_data[face_type];

        face.prefab!.set_text!(face_data.text);
        face.prefab!.set_color!(face_data.color);
        created_zombot.parent.interactions!.light!.set_color!(face_data.color);
    }

    const wheels_idx = created_zombot.children.findIndex(child => child.label === "wheels");
    const wheels = created_zombot.children[wheels_idx]!;

    // wheel rotation animation when moving
    const wheel_anim = await new h.AnimationBuilder()
        .named("wheel_anim") // TODO: do we even need named animation bindings? triggers can just reference the animation handle directly to stop the duplication
        .add_track(h.KeyframeTrackBuilder.rotation(wheels)
            .add_keyframe(0, [0, 0, 0, 1])
            .add_keyframe(250, [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)])
            .add_keyframe(500, [Math.sin(Math.PI / 2), 0, 0, Math.cos(Math.PI / 2)])
            .add_keyframe(750, [Math.sin(3 * Math.PI / 4), 0, 0, Math.cos(3 * Math.PI / 4)])
            .add_keyframe(1000, [Math.sin(Math.PI), 0, 0, Math.cos(Math.PI)])
            .build()
        )
        .loops()
        .create();

    // TODO: why has wheel anim stopped happening? monitor is indeed firing
    await created_zombot.modify()
        // TODO: maybe a way to have axis monitors report falling edge?
        .add_monitor("moving", new h.LinearVelocityMonitorBuilder()
            .when("any")
            .x({min: 0.01})
            .y({min: 0.01})
            .build()
        )
        .add_monitor("stopped", new h.LinearVelocityMonitorBuilder()
            .when("any")
            .x({max: 0.01})
            .y({max: 0.01})
            .build()
        )
        .add_trigger(new h.TriggerBuilder("moving")
            .add_target(new h.TriggerTargetBuilder({target: wheel_anim, name: "wheel_anim"}, "play").build())
            .build()
        )
        .add_trigger(new h.TriggerBuilder("stopped")
            .add_target(new h.TriggerTargetBuilder({target: wheel_anim, name: "wheel_anim"}, "stop").build())
            .build()
        )
        .apply();

    // surprise animation to be played when a player activates the zombot by getting too close (and not already being in the "fighter" state)
    const surprise_anim = await new h.AnimationBuilder()
        .named("surprise_anim")
        .add_track(h.KeyframeTrackBuilder.position(created_zombot)
            .relative()
            .add_keyframe(0, [0, 0, 0])
            .add_keyframe(100, [0, 0.5, 0])
            .add_keyframe(400, [0, 0.5, 0])
            .add_keyframe(500, [0, 0, 0])
            .build()
        )
        .add_track(h.KeyframeTrackBuilder.rotation(created_zombot)
            .relative()
            .add_keyframe(0, [0, 0, 0, 1])
            .add_keyframe(100, [0, 0, Math.sin(Math.PI / 24), Math.cos(Math.PI / 24)])
            .add_keyframe(250, [0, 0, 0, 1])
            .add_keyframe(300, [0, 0, -Math.sin(Math.PI / 24), Math.cos(Math.PI / 24)])
            .add_keyframe(500, [0, 0, 0, 1])
            .build()
        )
        .create();
    await surprise_anim.stop(); // TODO: why is it held before start?

    const play_surprise_anim = async () => {
        await surprise_anim.seek(0);
        await surprise_anim.play();

        // TODO: no finished report yet so just use a timeout for now
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve();
            }, 500);
        });
    }

    // TODO: proper state machine, either here or maybe some engine construct that can be used with fe/re triggers

    let ongoing_seek: hvr.builders.SeekHandle | null = null;
    let in_range = 0;

    const seek_core = async () => {
        ongoing_seek = await created_zombot.seek()
            .toward_object(created_core.object.id)
            .set_distance(3)
            .speed(zombot_speed)
            .start();
    }

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

                if (ongoing_seek) {
                    ongoing_seek.stop();
                }

                if (in_range === 1) {
                    // rising edge, play surprise anim first
                    await change_face("alerted");
                    await play_surprise_anim();
                }

                change_face("fighter");

                // seek player
                ongoing_seek = await created_zombot
                    .seek()
                    .speed(zombot_speed)
                    .set_distance(1)
                    .toward_player(player.username)
                    .start();
            } else if (event.payload.type === "exit") {
                in_range--;

                if (in_range <= 0) {
                    change_face("neutral");
                    in_range = 0;

                    seek_core();
                }
            }
        }
    );

    seek_core();
}
