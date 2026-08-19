import { z } from "zod";
import {BindingConfigSchema} from "./binding";

const FilterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const TriggerEventFilterSchema = z.record(
    z.string(),
    z.union([FilterValueSchema, z.array(FilterValueSchema).min(1)])
);
export type TriggerEventFilter = z.infer<typeof TriggerEventFilterSchema>;

export const TriggerTargetSchema = z.object({
    target: BindingConfigSchema,
    command: z.string(),

    arguments: z.record(z.string(), z.any()).optional(),
    arguments_from_event: z.record(z.string(), z.string()).optional(),
});
export type TriggerTarget = z.infer<typeof TriggerTargetSchema>;
export type TriggerTargetInput = z.input<typeof TriggerTargetSchema>;

export const TriggerSchema = z.object({
    source: BindingConfigSchema,
    event_filter: TriggerEventFilterSchema.optional(),
    targets: z.array(TriggerTargetSchema).min(1),
    cooldown_ms: z.number().int().nonnegative().optional(),
});
export type Trigger = z.infer<typeof TriggerSchema>;
export type TriggerInput = z.input<typeof TriggerSchema>;

/*
example of using triggers for no latency gun implementation in sdk:

const h = hyperlinkvr.builders;

const GUN_MESH = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb";
const TARGET_MESH = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Box/glTF-Binary/Box.glb";

const targets = await Promise.all(
    [-1.5, 0, 1.5].map((x, index) =>
        new h.EngineObjectDispatchBuilder(new h.CustomObjectBuilder()
                .set_mesh(TARGET_MESH)
                .set_physics(new h.PhysicsSystemBuilder()
                    .set_rigid_body(new h.FixedRigidBodyBuilder()
                        .set_collider(new h.ColliderBuilder().box([0.4, 0.4, 0.1]).build())
                        .build()
                    )
                    .build()
                )
                .build()
            )
            .set_position(x, 1.4, -6)
            // the raycast filters on this tag, so scenery is ignored
            .set_tags(["target"])
            .set_user_data({index})
            .create()
    )
);

const pistol = new h.CustomObjectBuilder()
    .set_mesh(GUN_MESH)
    .set_physics(new h.PhysicsSystemBuilder()
        .set_rigid_body(new h.DynamicRigidBodyBuilder()
            .set_collider(new h.ColliderBuilder().box([0.06, 0.15, 0.25]).build())
            .set_mass(1.2)
            .build()
        )
        .build()
    )
    .add_interaction("grip", new h.GrabbableInteractionBuilder()
        .set_snaps_to_hand(true)
        // the trigger below sources from this, so the report has to be on
        .reports_trigger()
        .build()
    )
    .add_interaction("shot", new h.RaycastInteractionBuilder()
        .set_origin_offset([0, 0.02, -0.2])
        .set_aim(new h.RaycastAimBuilder().direction([0, 0, -1], 60).build())
        // clears the shooter's own hand and torso, which sit in front of the muzzle while the gun is held
        .set_min_distance(0.5)
        .set_targets(new h.RaycastTargetsBuilder()
            .include_objects(["target"])
            .exclude_players()
            .build()
        )
        // fired by the trigger below rather than by watching input itself
        .set_trigger(new h.RaycastTriggerBuilder().manual().build())
        .reports_misses()
        .build()
    )
    .build();

const created_pistol = await new h.EngineObjectDispatchBuilder(pistol)
    .set_position(0, 1.1, -1)
    // fires in the same frame as the press, so the ray leaves the muzzle where the muzzle actually was rather than a round trip later
    .add_trigger(new h.TriggerBuilder("grip")
        .filter_event_type("trigger-start")
        .add_target(new h.TriggerTargetBuilder("shot", "fire").build())
        .set_cooldown(250)
        .build()
    )
    .on("shot", async (event) => {
        if (event.payload.type !== "cast") return;

        const hit = event.payload.hits[0];
        if (!hit || hit.interacted.type !== "object") {
            console.log("missed");
            return;
        }

        const target = targets.find(
            (candidate) => candidate.object.id === hit.interacted.object_id
        );
        if (!target) return;

        console.log(`hit target at ${hit.distance.toFixed(1)}m`);

        // knock it back, then put it back a moment later
        const [x, y, z] = target.object.transform.position;
        await target.modify().set_position(x, y, z - 0.3).tween(80);
        setTimeout(() => {
            target.modify().set_position(x, y, z).tween(300);
        }, 400);
    })
    .create();
 */