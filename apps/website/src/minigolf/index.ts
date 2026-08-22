import { add_player, get_ball_by_object_id, get_ball_of_player, get_owner_of_ball, next_hole, scored_on_hole, stroke_at_rest, take_stroke } from "./game_state";
import { countdown_to_start } from "./hud";
import { get_custom_marker_subset, get_hole_markers, get_marker, load_all_markers } from "./markers";
import { calculate_launch_velocity, normalise_vector } from "./util";


// offset not used anymore, but may as well keep the constant to ensure markers are always aligned
const COURSE_POS = [0, 0, 0] as [number, number, number];

let starting = false;
const start_game = async () => {
    if (starting) return;

    starting = true;
    await countdown_to_start();

    // go to first hole
    next_hole();
};

let spawn_marker: h.Marker | null = null;

const load_spawn_marker = async () => {
    // spawn marker stored in terrain, not course
    const markers = await hyperlinkvr.markers.load("./terrain_vis.glb", {
        transform_offset: {
            position: COURSE_POS
        }
    });

    spawn_marker = markers.get("spawn");
    if (!spawn_marker) {
        throw new Error("Spawn marker not found in terrain_vis.glb");
    }
};

hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();
    console.log("Connected!");

    const h = hyperlinkvr.builders;

    const promises: Promise<typeof h.EngineObjectCreationResult>[] = [];

    const course = new h.CustomObjectBuilder()
        .set_mesh("./course.glb")
        .set_physics(
            new h.PhysicsSystemBuilder()
                .set_rigid_body(
                    new h.FixedRigidBodyBuilder()
                        .set_collider(
                            new h.ColliderBuilder()
                                .custom_mesh("./course.glb", "trimesh")
                                .build()
                        )
                        .set_friction(0.6)
                        .build()
                )
                .build()
        )
        .build();

    // dispatch course + terrain first and await to ensure colliders catch putters and balls
    const promise_course = new h.EngineObjectDispatchBuilder(course)
        .set_position(COURSE_POS)
        .create();

    const terrain = new h.CustomObjectBuilder()
        .set_mesh("./terrain_vis.glb")
        .set_physics(
            new h.PhysicsSystemBuilder()
                .set_rigid_body(
                    new h.FixedRigidBodyBuilder()
                        .set_collider(
                            new h.ColliderBuilder()
                                .custom_mesh("./terrain_vis.glb", "trimesh")
                                .build()
                        )
                        .set_friction(0.6)
                        .build()
                )
                .build()
        )
        .build();

    const promise_terrain = new h.EngineObjectDispatchBuilder(terrain)
        .set_position(COURSE_POS)
        .create();

    promises.push(promise_course, promise_terrain);

    const trigger_dummy = new h.CustomObjectBuilder()
        .add_interaction(
            "trigger",
            new h.TriggerVolumeInteractionBuilder()
                .set_collider(
                    new h.ColliderBuilder().cylinder(0.045, 0.01).build()
                )
                .include_objects(["golf_ball"])
                .exclude_players()
                .build()
        )
        .build();

    await load_all_markers(COURSE_POS);

    const hole_markers = get_hole_markers();

    hole_markers.forEach((marker) => {
        // create trigger volume at the marker
        // could add these all to the course mesh, but easier to just make separate dummies

        promises.push(
            new h.EngineObjectDispatchBuilder(trigger_dummy)
                .on("trigger", (e) => {
                    if (e.kind !== "trigger-volume") return;
                    if (e.payload.type !== "enter") return;

                    const interacted = e.payload.interacted;
                    if (!interacted || interacted.type !== "object") return;

                    const object_id = interacted.object_id;
                    const owner = get_owner_of_ball(object_id);
                    if (owner === undefined) {
                        console.warn(`No owner found for ball ${object_id}`);
                        return;
                    }

                    scored_on_hole(owner);
                })
                .set_transform(marker.transform)
                .create()
        );
    });

    if (!spawn_marker) {
        await load_spawn_marker();
    }

    const spawn_pos = spawn_marker.transform.position;
    const button_pos = [
        spawn_pos[0],
        spawn_pos[1] + 1,
        spawn_pos[2] - 3
    ] as [number, number, number];

    const start_button = new h.ButtonPrefabBuilder()
        .named("start_button")
        .set_label("Start")
        .build();

    const creatable_start_button = new h.EngineObjectDispatchBuilder(
        start_button
    )
        .set_position(button_pos)
        .on("start_button", async (e) => {
            if (e.kind !== "button-prefab") return;
            if (e.payload.type === "press") {
                start_game();

                // guaranteed to exist but need to unwrap promise with await
                (await creatable_start_button).destroy();
            }
        })
        .create();

    promises.push(creatable_start_button);

    await Promise.all(promises);

    const waterwheel = new h.CustomObjectBuilder()
        .set_mesh("./waterwheel_vis.glb")
        .set_physics(
            new h.PhysicsSystemBuilder()
                .set_rigid_body(
                    new h.KinematicPosRigidBodyBuilder()
                        .set_collider(
                            new h.ColliderBuilder()
                                .custom_mesh("./waterwheel_vis.glb", "trimesh")
                                .build()
                        )
                        .build()
                )
                .build()
        )
        .build();

    const waterwheel_marker = get_marker("waterwheel");

    const created_waterwheel = await new h.EngineObjectDispatchBuilder(
        waterwheel
    )
        .set_transform(waterwheel_marker.transform)
        .create();

    // 3 rpm rotation (20 seconds per rotation)
    const SINE_45 = 0.7071;
    await new h.AnimationBuilder()
        .add_track(
            h.KeyframeTrackBuilder.rotation(created_waterwheel)
                .add_keyframe(0, [0, 0, 0, 1]) // 0
                .add_keyframe(5000, [-SINE_45, 0, 0, SINE_45]) // 90
                .add_keyframe(10000, [-1, 0, 0, 0]) // 180
                .add_keyframe(15000, [-SINE_45, 0, 0, -SINE_45]) // 270
                .add_keyframe(20000, [0, 0, 0, -1]) // 360
                .build()
        )
        .loops()
        .autoplay()
        .create();

    // trigger hud message when they putt the ball through the volcano
    const volcano_marker = get_marker("volcano");
    const volcano_trigger_dummy = new h.CustomObjectBuilder()
        .add_interaction(
            "trigger",
            new h.TriggerVolumeInteractionBuilder()
                .set_collider(
                    new h.ColliderBuilder().cylinder(0.75, 0.1).build()
                )
                .include_objects(["golf_ball"])
                .exclude_players()
                .build()
        )
        .build();

    await new h.EngineObjectDispatchBuilder(volcano_trigger_dummy)
        .on("trigger", async (e) => {
            if (e.kind !== "trigger-volume") return;
            if (e.payload.type !== "exit") return;

            const interacted = e.payload.interacted;
            if (!interacted || interacted.type !== "object") return;

            const object_id = interacted.object_id;
            const owner = get_owner_of_ball(object_id);
            if (owner === undefined) {
                console.warn(`No owner found for ball ${object_id}`);
                return;
            }

            const hud = await h
                .hud_text("volcano", "Best jump in and follow it...")
                .set_slot("middle-center")
                .set_font_size(48)
                .player(owner)
                .create();

            setTimeout(() => {
                hud.destroy();
            }, 3000);
        })
        .set_transform(volcano_marker.transform)
        .create();

    // connect up randomisation trigger volume to send to a random output tube
    const random_input_marker = get_marker("random_in");
    const random_trigger_dummy = new h.CustomObjectBuilder()
        .add_interaction(
            "trigger",
            new h.TriggerVolumeInteractionBuilder()
                .set_collider(
                    new h.ColliderBuilder().box([0.5, 0.1, 2]).build()
                )
                .include_objects(["golf_ball"])
                .exclude_players()
                .build()
        )
        .build();

    const random_output_markers = Array.from(
        get_custom_marker_subset(/^random_out_/i).values()
    );

    await new h.EngineObjectDispatchBuilder(random_trigger_dummy)
        .on("trigger", (e) => {
            if (e.kind !== "trigger-volume") return;
            if (e.payload.type !== "enter") return;

            const interacted = e.payload.interacted;
            if (!interacted || interacted.type !== "object") return;

            const random_index = Math.floor(
                Math.random() * random_output_markers.length
            );
            const random_output_marker = random_output_markers[random_index]!;

            // teleport to random marker and apply impulse to simulate output speed
            // TODO: match output velocity to inbound speed
            const object_id = interacted.object_id;
            new h.EngineObjectModificationBuilder(object_id)
                .set_transform(random_output_marker.transform)
                .apply_impulse([-0.001, 0, 0])
                .apply();
        })
        .set_transform(random_input_marker.transform)
        .create();

    // marker to capture and freeze ball at cannon
    const cannon_marker = get_marker("cannon");
    const cannon = new h.CustomObjectBuilder()
        .set_mesh("./cannon.glb")
        .add_interaction(
            "trigger",
            new h.TriggerVolumeInteractionBuilder()
                .set_collider(
                    new h.ColliderBuilder().box([1.1, 1.1, 1.1]).build()
                )
                .include_objects(["golf_ball"])
                .exclude_players()
                .build()
        )
        .build();

    const loaded_ball_ids = new Set<string>();
    const created_cannon = await new h.EngineObjectDispatchBuilder(cannon)
        .on("trigger", (e) => {
            if (e.kind !== "trigger-volume") return;

            const interacted = e.payload.interacted;
            if (!interacted || interacted.type !== "object") return;

            const object_id = interacted.object_id;

            if (e.payload.type === "exit") {
                loaded_ball_ids.delete(object_id);
                return;
            }

            if (loaded_ball_ids.has(object_id)) {
                return;
            }

            loaded_ball_ids.add(object_id);

            new h.EngineObjectModificationBuilder(object_id)
                .set_transform(cannon_marker.transform)
                .set_velocity([0, 0, 0])
                .set_angular_velocity([0, 0, 0])
                .apply();

            // disable interaction
            const ball = get_ball_by_object_id(object_id);
            if (!ball) {
                console.warn(`No ball found for object ${object_id}`);
                return;
            }

            ball.prefab.lock();
        })
        .set_transform(cannon_marker.transform)
        .create();

    const apex = get_marker("fire_apex");
    const target = get_marker("fire_target");

    const [velocity, time_s] = calculate_launch_velocity(
        cannon_marker.transform.position,
        apex.transform.position,
        target.transform.position
    );

    const anim_vector = normalise_vector([
        target.transform.position[0] - cannon_marker.transform.position[0],
        target.transform.position[1] - cannon_marker.transform.position[1],
        target.transform.position[2] - cannon_marker.transform.position[2]
    ]);

    // the cannon shoots back quickly against the vector, then returns to its original position
    const fire_animation = await new h.AnimationBuilder()
        .named("fire_anim")
        .add_track(
            h.KeyframeTrackBuilder.position(created_cannon)
                .add_keyframe(0, cannon_marker.transform.position)
                .add_keyframe(100, [
                    cannon_marker.transform.position[0] - anim_vector[0] * 0.5,
                    cannon_marker.transform.position[1] - anim_vector[1] * 0.5,
                    cannon_marker.transform.position[2] - anim_vector[2] * 0.5
                ])
                .add_keyframe(300, cannon_marker.transform.position)
                .build()
        )
        .set_duration(500)
        .create();

    const fire_button = new h.ButtonPrefabBuilder()
        .named("fire")
        .set_label("Fire!")
        .set_body_color(0xff0000)
        .build();

    const fire_button_marker = get_marker("fire_button");

    await new h.EngineObjectDispatchBuilder(fire_button)
        .set_transform(fire_button_marker.transform)
        .on("fire", async (e) => {
            if (e.kind !== "button-prefab") return;
            if (e.payload.type !== "press") return;

            const ball = get_ball_of_player(e.payload.username);
            if (!ball) {
                console.warn(`No ball found for player ${e.payload.username}`);
                return;
            }

            if (!loaded_ball_ids.has(ball.object.id)) {
                console.warn(
                    `Ball ${ball.object.id} not loaded in cannon for player ${e.payload.username}`
                );
                return;
            }

            // disable damping as our formula doesn't account for it, then re-enable after the flight time
            await ball.prefab.set_damping_enabled(false);

            // fire the ball at the computed velocity to follow the launch curve
            await ball.modify().set_velocity(velocity).apply();

            setTimeout(
                async () => {
                    await ball.prefab.set_damping_enabled(true);
                },
                time_s * 1000 + 100
            ); // small buffer to ensure it makes it

            // firing counts as a stroke
            take_stroke(e.payload.username);
            stroke_at_rest(e.payload.username);
            ball.prefab.unlock();

            // animate the cannon
            await fire_animation.seek(0);
            fire_animation.play();
        })
        .create();

    hyperlinkvr.finished_loading();
});


hyperlinkvr.players.on_spawn(async (p) => {
    if (!spawn_marker) {
        await load_spawn_marker();
    }

    p.teleport_to(spawn_marker.transform.position, spawn_marker.transform.rotation[1]);
    add_player(p, spawn_marker.transform.position);
});