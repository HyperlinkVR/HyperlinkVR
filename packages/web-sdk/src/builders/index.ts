export * from "./interactions";
export * from "./object_monitors";
export * from "./player_monitors";
export * from "./physics";
export * from "./prefabs";
export * from "./custom";
export * from "./dispatch";
export * from "./world_env";
export * from "./triggers";
export * from "./animation";

// example usage for custom object:
/*
const sword = new CustomObjectBuilder()
    .set_mesh("https://example.com/sword.glb")
    .set_physics(new PhysicsSystemBuilder()
        .set_rigid_body(new DynamicRigidBodyBuilder()
            .set_collider(new ColliderBuilder().box([0.1, 1, 0.1]).build())
            .set_mass(2)
            .build()
        )
        .build()
    )
    .add_interaction("grab", new GrabbableInteractionBuilder()
        .reports_grabs() // now recieves events when object grabbed
        .build()
    )
    .build();

const created_sword = await new EngineObjectDispatchBuilder()
    .set_object(sword)
    .set_position(0, 1, -2)
    .add_monitor(
        // we also recieve an event when being swung faster than 5 rads/s in any direction
        "swung",
        new AngularVelocityMonitorBuilder()
            .when("any")
            .x({ min: 5 })
            .y({ min: 5 })
            .z({ min: 5 })
            .build()
    )
    .on("grab", (event) => console.log("grabbed", event.object_id))
    .on("swung", () => console.log("swung"))
    .create();

console.log("Created sword object with ID:", created_sword.object.id);

// if you want to get rid of it:
created_sword.destroy().then(() => console.log("sword destroyed"));

 */

// example usage for button prefab:
/*
const button = new ButtonPrefabBuilder()
    .named("my_button")
    .set_label("Press Me")
    .set_color(0xff0000)
    .build();

const created_button = await new EngineObjectDispatchBuilder()
    .set_object(button)
    .set_position(1, 1, -2)
    .on("my_button", (event) => console.log("button event:", event))
    .create();

console.log("Created button object with ID:", created_button.object.id);
*/
