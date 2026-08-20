import { add_player, get_owner_of_ball, next_hole, scored_on_hole} from "./game_state";
import { countdown_to_start } from "./hud";
import { get_hole_markers, get_marker, load_all_markers } from "./markers";


const COURSE_POS = [0, 0, -10] as [number, number, number];

let starting = false;
const start_game = async () => {
    if (starting) return;

    starting = true;
    await countdown_to_start();

    // go to first hole
    next_hole();
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

    // dispatch course first and await to ensure colliders catch putters and balls
    await new h.EngineObjectDispatchBuilder(course)
        .set_position(COURSE_POS)
        .create()

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
        )
    });

    const start_button = new h.ButtonPrefabBuilder()
        .named("start_button")
        .set_label("Start")
        .build();

    const creatable_start_button = new h.EngineObjectDispatchBuilder(start_button)
        .set_position(0, 1.5, -3)
        .on("start_button", async (e) => {
            if (e.kind !== "button-prefab") return;
            if (e.payload.type === "press") {
                start_game();

                // guaranteed to exist but need to unwrap promise with await
                (await creatable_start_button).destroy();
            }
        })
        .create()

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

    const created_waterwheel = await new h.EngineObjectDispatchBuilder(waterwheel)
        .set_transform(waterwheel_marker.transform)
        .create();

    // 3 rpm rotation (20 seconds per rotation)
    const SINE_45 = 0.7071;
    await new h.AnimationBuilder()
        .add_track(
            h.KeyframeTrackBuilder.rotation(created_waterwheel)
                .add_keyframe(0,     [0,        0, 0, 1])         // 0
                .add_keyframe(5000,  [-SINE_45, 0, 0, SINE_45])   // 90
                .add_keyframe(10000, [-1,       0, 0, 0])         // 180
                .add_keyframe(15000, [-SINE_45, 0, 0, -SINE_45])  // 270
                .add_keyframe(20000, [0,        0, 0, -1])        // 360
                .build()
        )
        .loops()
        .autoplay()
        .create();

    hyperlinkvr.finished_loading();
});

hyperlinkvr.players.on_spawn((p) => {
    p.teleport_to([0, 0, 0], 0);
    add_player(p);
});