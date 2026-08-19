import { add_player, next_hole } from "./game_state";
import { countdown_to_start } from "./hud";


const COURSE_POS = [0, 1, 0] as [number, number, number];

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
        .set_position(0, 1, 0)
        .create()

    const trigger_dummy = new h.CustomObjectBuilder()
        .add_interaction(
            "trigger",
            new h.TriggerVolumeInteractionBuilder()
                .set_collider(
                    new h.ColliderBuilder().cylinder(0.45, 0.01).build()
                )
                .include_objects(["golf_ball"])
                .exclude_players()
                .build()
        )
        .build();

    const markers = await hyperlinkvr.markers.load("./course.glb", {
        transform_offset: {
            position: COURSE_POS
        }
    });

    markers.forEach((marker) => {
        // create trigger volume at the marker
        // could add these all to the course mesh, but easier to just make separate dummies

        promises.push(
            new h.EngineObjectDispatchBuilder(trigger_dummy)
                .on("trigger", () => console.log(`scored on hole ${marker.name}`))
                .set_transform(marker.transform)
                .create()
        )
    });

    const start_button = new h.ButtonPrefabBuilder()
        .named("start_button")
        .set_label("Start")
        .build();

    const creatable_start_button = new h.EngineObjectDispatchBuilder(start_button)
        .set_position(COURSE_POS[0], COURSE_POS[1] + 0.75, COURSE_POS[2] - 3)
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

    hyperlinkvr.finished_loading();
});

hyperlinkvr.players.on_spawn((p) => {
    p.teleport_to([COURSE_POS[0], COURSE_POS[1] + 0.5, COURSE_POS[2]]);
    add_player(p);
});