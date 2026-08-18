const COURSE_POS = [0, 1, 0] as [number, number, number];

hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();
    console.log("Connected!");

    const h = hyperlinkvr.builders;

    const promises = [];

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

    promises.push(
        new h.EngineObjectDispatchBuilder()
            .set_object(course)
            .set_position(0, 1, 0)
            .create()
    );

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

        new h.EngineObjectDispatchBuilder()
            .set_object(trigger_dummy)
            .on("trigger", () => console.log(`scored on hole ${marker.name}`))
            .set_transform(marker.transform)
            .create();
    });

    for (let i = 0; i < 5; i++) {
        const x = i - 2.5;

        // random neon putter color, and the ball automatically matches just like real mini golf :)
        const putter = new h.GolfPutterPrefabBuilder().random_color().build();
        const ball = new h.GolfBallPrefabBuilder()
            .named("ball")
            .set_color(putter.color)
            .build();

        promises.push(
            new h.EngineObjectDispatchBuilder()
                .set_object(putter)
                .set_position(x, 3, -1)
                .create()
        );

        promises.push(
            new h.EngineObjectDispatchBuilder()
                .set_object(ball)
                .set_position(x, 2.5, -2)
                .on("ball", async (event) => {
                    console.log(`Ball ${i}`, event);
                })
                .create()
        );
    }

    await Promise.all(promises);

    hyperlinkvr.finished_loading();
});

hyperlinkvr.players.on_spawn((p) => {
    p.teleport_to([COURSE_POS[0], COURSE_POS[1] + 0.5, COURSE_POS[2]]);
});
