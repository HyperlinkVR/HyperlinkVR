import { z } from "zod";

import { AbsoluteAssetURLSchema } from "./assets";
import { bindable } from "./binding";
import { HexColorSchema } from "./colors";
import { BoxColliderSchema, CapsuleColliderSchema, ColliderOrCollectionSchema, SphereColliderSchema } from "./physics";
import { RotationSchema } from "./transforms";


export const GrabOffsetSpaceSchema = z.enum(["grip", "aim"]);
export type GrabOffsetSpace = z.infer<typeof GrabOffsetSpaceSchema>;

export const GrabOffsetSchema = z.object({
    position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    rotation: RotationSchema.default([0, 0, 0]),

    // "grip": raw webxr grip axes, so the offset tilts with the wrist
    // "aim":  [right, up, forward] built from the pointer direction and world up,
    //         positioned at the grip. wrist-independent, reads more predictably
    // only applies when the object actually snaps (snaps_to_hand, or any ray grab)
    space: GrabOffsetSpaceSchema.default("aim")
});
export type GrabOffset = z.infer<typeof GrabOffsetSchema>;
export type GrabOffsetInput = z.input<typeof GrabOffsetSchema>;
export const AutoBoundingBoxColliderSchema = z.object({
    type: z.literal("auto-bounding-box")
});
export type AutoBoundingBoxCollider = z.infer<
    typeof AutoBoundingBoxColliderSchema
>;
export const AutoBoundingSphereColliderSchema = z.object({
    type: z.literal("auto-bounding-sphere")
});
export type AutoBoundingSphereCollider = z.infer<
    typeof AutoBoundingSphereColliderSchema
>;
export const GrabColliderSchema = z.discriminatedUnion("type", [
    AutoBoundingBoxColliderSchema,
    AutoBoundingSphereColliderSchema,
    BoxColliderSchema,
    SphereColliderSchema,
    CapsuleColliderSchema
    // TODO: should this support collider collections?
]);
export type GrabCollider = z.infer<typeof GrabColliderSchema>;
export const GrabbableInteractionSchema = bindable({
    type: z.literal("grabbable"),
    collider: GrabColliderSchema.default({type: "auto-bounding-box"}),
    grab_distance: z.number().positive().optional(),
    grab_offset: GrabOffsetSchema.optional(),
    sticky: z.boolean().default(false),
    snaps_to_hand: z.boolean().default(true),
    report_grabs: z.boolean().default(false),
    report_releases: z.boolean().default(false),
    report_proximity: z.boolean().default(false),
    report_trigger: z.boolean().default(false), // report when the grab trigger is pressed while holding the object TODO: accept a repeatable schema to request any input event when held, and reuse for seat etc
    flat_throwable: z.boolean().default(true), // false only prevents using the throw button on flat mode (ui hint). we cant stop vr players throwing. use max_throw_speed = 0 to make it slip out their hand instead
    min_flat_throw_speed: z.number().nonnegative().optional(), // the speed of the minimum throw on flat (tapping the throw key)
    max_throw_speed: z.number().nonnegative().optional(), // the maximum throw speed on flat and vr. note that an additional headroom of 1.2x is applied so that locomotion can add to the speed
    // TODO: add ability to disable player and world ignore when held (probably add prop ignore as an option too)
})
    .refine((interaction) => {
        return !(interaction.grab_offset && !interaction.snaps_to_hand);
    }, "grab_offset is only valid when snaps_to_hand is true");
export type GrabbableInteraction = z.infer<typeof GrabbableInteractionSchema>;
export type GrabbableInteractionInput = z.input<typeof GrabbableInteractionSchema>;

const TriggerVolumeObjectsDisableSchema = z.object({
    include: z.literal(false)
});
const TriggerVolumeObjectsEnableSchema = z.object({
    include: z.literal(true),
    tag_filter: z.array(z.string()).optional()
});
const TriggerVolumeObjectsSchema = z.union([
    TriggerVolumeObjectsDisableSchema,
    TriggerVolumeObjectsEnableSchema
]);
export const TriggerVolumeInteractionSchema = bindable({
    type: z.literal("trigger-volume"),
    collider: ColliderOrCollectionSchema,
    report_enter: z.boolean().default(true),
    report_exit: z.boolean().default(true),
    ignore_hands: z.boolean().default(false),
    ignore_torso: z.boolean().default(false),
    ignore_head: z.boolean().default(false),
    objects: TriggerVolumeObjectsSchema.default({include: false})
});
export type TriggerVolumeInteraction = z.infer<
    typeof TriggerVolumeInteractionSchema
>;
export type TriggerVolumeInteractionInput = z.input<
    typeof TriggerVolumeInteractionSchema
>;
export const FollowPlayerInteractionSchema = bindable({
    type: z.literal("follow-player"),
    enabled: z.boolean().default(true),
    snap_on_release: z.boolean().default(false) // if true, disabling follow will make the object obey its position coordinates rather than freezing in place. likely irrelevant for most implementations
});
export type FollowPlayerInteraction = z.infer<typeof FollowPlayerInteractionSchema>;
export type FollowPlayerInteractionInput = z.input<typeof FollowPlayerInteractionSchema>;
export const PositionalAudioInteractionSchema = bindable({
    type: z.literal("positional-audio"),
    url: AbsoluteAssetURLSchema,
    max_distance: z.number().positive().default(10),
    loop: z.boolean().default(false),
    autoplay: z.boolean().default(false),
    offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
});
export type PositionalAudioInteraction = z.infer<typeof PositionalAudioInteractionSchema>;
export type PositionalAudioInteractionInput = z.input<typeof PositionalAudioInteractionSchema>
export const GlobalAudioInteractionSchema = bindable({
    type: z.literal("global-audio"),
    url: AbsoluteAssetURLSchema,
    loop: z.boolean().default(false),
    autoplay: z.boolean().default(false),
    volume: z.number().min(0).max(1).default(1)
});
export type GlobalAudioInteraction = z.infer<typeof GlobalAudioInteractionSchema>;
export type GlobalAudioInteractionInput = z.input<typeof GlobalAudioInteractionSchema>
export const PointLightInteractionSchema = bindable({
    type: z.literal("point-light"),
    color: HexColorSchema.default(0xffffff),
    intensity: z.number().nonnegative().default(1),
    distance: z.number().nonnegative().default(0),
    decay: z.number().nonnegative().default(2),
    offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    // shadows are opt-in per light: casting is comparatively expensive and only a
    // handful of lights should realistically do it. everything else (map size, bias,
    // shadow-camera range) is tuned automatically.
    cast_shadow: z.boolean().default(true),
});
export type PointLightInteraction = z.infer<typeof PointLightInteractionSchema>;
export type PointLightInteractionInput = z.input<typeof PointLightInteractionSchema>;
export const SpotLightInteractionSchema = bindable({
    type: z.literal("spot-light"),
    color: HexColorSchema.default(0xffffff),
    intensity: z.number().nonnegative().default(1),
    distance: z.number().nonnegative().default(0),
    decay: z.number().nonnegative().default(2),
    angle: z.number().min(0).max(Math.PI / 2).default(Math.PI / 3),
    penumbra: z.number().min(0).max(1).default(0),
    offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    rotation: RotationSchema.default([0, 0, 0]),
    cast_shadow: z.boolean().default(true),
});
export type SpotLightInteraction = z.infer<typeof SpotLightInteractionSchema>;
export type SpotLightInteractionInput = z.input<typeof SpotLightInteractionSchema>;
export const DirectionalLightInteractionSchema = bindable({
    type: z.literal("directional-light"),
    color: HexColorSchema.default(0xffffff),
    intensity: z.number().nonnegative().default(1),
    offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    rotation: RotationSchema.default([0, 0, 0]),
    cast_shadow: z.boolean().default(true),
    // half-extent (metres) of the orthographic shadow frustum centred on the light
    shadow_area: z.number().positive().default(30),
});
export type DirectionalLightInteraction = z.infer<typeof DirectionalLightInteractionSchema>;
export type DirectionalLightInteractionInput = z.input<typeof DirectionalLightInteractionSchema>;
const BaseParticleEmitterShapeSchema = z.object({
    type: z.string(),
});
export const ParticleEmitterShapeModeSchema = z.enum(["random", "loop", "ping-pong", "burst"]).default("random");
export type ParticleEmitterShapeMode = z.infer<typeof ParticleEmitterShapeModeSchema>;
export const ParticleEmitterShapePointSchema = BaseParticleEmitterShapeSchema.extend({
    type: z.literal("point")
});
export type ParticleEmitterShapePoint = z.infer<typeof ParticleEmitterShapePointSchema>;
export type ParticleEmitterShapePointInput = z.input<typeof ParticleEmitterShapePointSchema>;
export const ParticleEmitterShapeSphereSchema = BaseParticleEmitterShapeSchema.extend({
    type: z.literal("sphere"),
    mode: ParticleEmitterShapeModeSchema.optional(),
    radius: z.number().positive(),
    thickness: z.number().nonnegative().optional()
});
export type ParticleEmitterShapeSphere = z.infer<typeof ParticleEmitterShapeSphereSchema>;
export type ParticleEmitterShapeSphereInput = z.input<typeof ParticleEmitterShapeSphereSchema>;
export const ParticleEmitterShapeConeSchema = BaseParticleEmitterShapeSchema.extend({
    type: z.literal("cone"),
    mode: ParticleEmitterShapeModeSchema.optional(),
    radius: z.number().positive(),
    angle: z.number().min(0).max(Math.PI / 2),
    arc: z.number().min(0).max(Math.PI * 2).optional()
});
export type ParticleEmitterShapeCone = z.infer<typeof ParticleEmitterShapeConeSchema>;
export type ParticleEmitterShapeConeInput = z.input<typeof ParticleEmitterShapeConeSchema>;
// TODO: add remaining per-shape props
export const ParticleEmitterShapeSchema = z.discriminatedUnion("type", [
    ParticleEmitterShapePointSchema,
    ParticleEmitterShapeSphereSchema,
    ParticleEmitterShapeConeSchema
    // TODO: rectangle, grid, hemisphere, donut, mesh. maybe could reuse collider system and just reinterpret?
]);
export type ParticleEmitterShape = z.infer<typeof ParticleEmitterShapeSchema>;
export type ParticleEmitterShapeInput = z.input<typeof ParticleEmitterShapeSchema>;
export const ParticleEmitterVisualImageSchema = z.object({
    type: z.literal("image"),
    url: AbsoluteAssetURLSchema,
    alpha: z.number().min(0).max(1).default(1).optional()
});
export type ParticleEmitterVisualImage = z.infer<typeof ParticleEmitterVisualImageSchema>;
export type ParticleEmitterVisualImageInput = z.input<typeof ParticleEmitterVisualImageSchema>;
export const ParticleEmitterVisualQuadSchema = z.object({
    type: z.literal("quad"),
    width: z.number().positive(),
    height: z.number().positive(),
    color: HexColorSchema.default(0xffffff).optional(),
    alpha: z.number().min(0).max(1).default(1).optional()
});
export type ParticleEmitterVisualQuad = z.infer<typeof ParticleEmitterVisualQuadSchema>;
export type ParticleEmitterVisualQuadInput = z.input<typeof ParticleEmitterVisualQuadSchema>;
export const ParticleEmitterVisualSchema = z.discriminatedUnion("type", [
    ParticleEmitterVisualImageSchema,
    ParticleEmitterVisualQuadSchema
]);
export type ParticleEmitterVisual = z.infer<typeof ParticleEmitterVisualSchema>;
export type ParticleEmitterVisualInput = z.input<typeof ParticleEmitterVisualSchema>;

// TODO: more options, its any threejs material. need to use it more to figure out what though (stuff like shapes and animations)
// TODO: emissive particles etc, maybe just have a central "material schema" and accept that, which can also be reused for material override later

export const ParticleEmitterGravityBehaviorSchema = z.object({
    type: z.literal("gravity"),
    origin: z.tuple([z.number(), z.number(), z.number()]).optional(),
    magnitude: z.number().default(9.81).optional(),
});
export type ParticleEmitterGravityBehavior = z.infer<typeof ParticleEmitterGravityBehaviorSchema>;
export type ParticleEmitterGravityBehaviorInput = z.input<typeof ParticleEmitterGravityBehaviorSchema>;

export const ParticleEmitterFadeOverLifeBehaviorSchema = z.object({
    type: z.literal("fade-over-life"),
    fade_in_ratio: z.number().gte(0).lte(1).default(0).optional(),
    fade_out_ratio: z.number().gte(0).lte(1).default(0).optional(),
});

export const ParticleEmitterBehaviorSchema = z.discriminatedUnion("type", [
    ParticleEmitterGravityBehaviorSchema,
    ParticleEmitterFadeOverLifeBehaviorSchema
]);
export type ParticleEmitterBehavior = z.infer<typeof ParticleEmitterBehaviorSchema>;
export type ParticleEmitterBehaviorInput = z.input<typeof ParticleEmitterBehaviorSchema>;
export const ParticleEmitterRandomisableValueSchema = z.union([
    z.number().nonnegative(),
    z.object({
        min: z.number().nonnegative(),
        max: z.number().nonnegative()
    })
]);
export type ParticleEmitterRandomisableValue = z.infer<typeof ParticleEmitterRandomisableValueSchema>;
export type ParticleEmitterRandomisableValueInput = z.input<typeof ParticleEmitterRandomisableValueSchema>;
export const ParticleEmitterColorSchema = z.union([
    HexColorSchema,
    z.array(HexColorSchema).min(2),
    z.array(z.object({
        color: HexColorSchema,
        weight: z.number().positive().default(1).optional(),
        alpha: z.number().min(0).max(1).default(1).optional()
    }))
]);
export type ParticleEmitterColor = z.infer<typeof ParticleEmitterColorSchema>;
export type ParticleEmitterColorInput = z.input<typeof ParticleEmitterColorSchema>;
export const ParticleEmitterInteractionSchema = bindable({
    type: z.literal("particle-emitter"),
    duration: z.number().positive().optional(),
    loop: z.boolean().default(false),
    autoplay: z.boolean().default(false),
    lifetime: ParticleEmitterRandomisableValueSchema.default(1),
    speed: ParticleEmitterRandomisableValueSchema.default(1),
    particle_size: ParticleEmitterRandomisableValueSchema.default(1).optional(),
    particle_rotation: ParticleEmitterRandomisableValueSchema.default(0).optional(),
    color: ParticleEmitterColorSchema.optional(),
    per_second: ParticleEmitterRandomisableValueSchema.default(10),
    emitter_shape: ParticleEmitterShapeSchema,
    visual: ParticleEmitterVisualSchema,
    // TODO: rendermode? or leave it up to the visuals
    behaviors: z.array(ParticleEmitterBehaviorSchema).optional(),
    // TODO: uvTileCount (whatever they are)
    // TODO: add the undocumented properties on particlesystem component
    world_space: z.boolean().default(true).optional(), // whether particles followe the emitter or remain in world space
    offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]).optional(),
    rotation: RotationSchema.default([0, 0, 0]).optional(),
    scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]).optional()
});
export type ParticleEmitterInteraction = z.infer<typeof ParticleEmitterInteractionSchema>;
export type ParticleEmitterInteractionInput = z.input<typeof ParticleEmitterInteractionSchema>;

// TODO: more quarks behaviours (need schema for bezier curve and gradient for overlife behaviors)
// export const ParticleEmitterBehaviorSizeOverLifeSchema = z.object({

// TODO: option to provide prebuilt quarks json
// TODO: support burst timings
// TODO: support sprite sheet
// TODO: support soft particles

export const SeatInteractionSchema = bindable({
    type: z.literal("seat"),
    anchor_offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    facing: RotationSchema.default([0, 0, 0]),
    yaw_range_deg: z.tuple([z.number(), z.number()]).optional(),
    report_sit: z.boolean().default(false),
    report_stand: z.boolean().default(false)
});
export type SeatInteraction = z.infer<typeof SeatInteractionSchema>;
export type SeatInteractionInput = z.input<typeof SeatInteractionSchema>;

export const RaycastSpaceSchema = z.enum(["local", "world"]);
export type RaycastSpace = z.infer<typeof RaycastSpaceSchema>;

// direction + distance
export const RaycastAimDirectionSchema = z.object({
    type: z.literal("direction"),
    direction: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, -1]),
    space: RaycastSpaceSchema.default("local"),
    distance: z.number().positive().default(50)
});

// euler/quat applied to the object's forward (-Z), so [0,0,0] casts straight ahead
export const RaycastAimRotationSchema = z.object({
    type: z.literal("rotation"),
    rotation: RotationSchema.default([0, 0, 0]),
    distance: z.number().positive().default(50)
});

export const RaycastAimEndpointSchema = z.object({
    type: z.literal("endpoint"),
    point: z.tuple([z.number(), z.number(), z.number()]),
    space: RaycastSpaceSchema.default("local")
});

// tracks a moving object each cast. overshoot > 0 keeps casting past it, so you can tell "hit the target" from "something got in the way"
export const RaycastAimObjectSchema = z.object({
    type: z.literal("object"),
    object_id: z.string(),
    overshoot: z.number().nonnegative().default(0)
});

export const RaycastAimSchema = z.discriminatedUnion("type", [
    RaycastAimDirectionSchema,
    RaycastAimRotationSchema,
    RaycastAimEndpointSchema,
    RaycastAimObjectSchema
]);
export type RaycastAim = z.infer<typeof RaycastAimSchema>;
export type RaycastAimInput = z.input<typeof RaycastAimSchema>;

export const RaycastTargetsSchema = z.object({
    // "physics" casts rapier colliders: fast, gives normals, resolves object ids and player body parts, but misses objects with no physics
    // "visual" casts three meshes instead
    against: z.enum(["physics", "visual"]).default("physics"),

    // trigger volumes are sensors, they should not stop a bullet by default
    include_sensors: z.boolean().default(false),

    // the object the interaction is attached to, and anything under it
    include_self: z.boolean().default(false),

    players: z.object({
            include: z.boolean().default(true),
            ignore_hands: z.boolean().default(false),
            ignore_head: z.boolean().default(false),
            ignore_torso: z.boolean().default(false)
        })
        .optional(),

    objects: z
        .object({
            include: z.boolean().default(true),
            tag_filter: z.array(z.string()).optional(),

            // TODO: port these 2 fields to trigger volume too
            exclude_tags: z.array(z.string()).optional(),
            exclude_object_ids: z.array(z.string()).optional(),
        })
        .optional(),

    // what happens to things the filters rejected
    // "block" means a wall still stops the ray and you get a miss
    // "pass-through" means the ray ignores them entirely and keeps going until a valid hit or the max distance is reached
    non_targets: z.enum(["block", "pass-through"]).default("block"),

    // > 1 pierces: keeps going after a valid hit and reports each in order
    max_hits: z.number().int().positive().default(1)
});
export type RaycastTargets = z.infer<typeof RaycastTargetsSchema>;
export type RaycastTargetsInput = z.input<typeof RaycastTargetsSchema>;

export const RaycastTriggerSchema = z.discriminatedUnion("type", [
    // only fires when the sdk calls .fire()
    z.object({ type: z.literal("manual") }),

    z.object({
        type: z.literal("continuous"),
        interval_ms: z.number().nonnegative().default(0), // 0 = every frame
        // only report when the thing being hit actually changes
        ignore_unchanged: z.boolean().default(true),
        // or when the hit point moves this far on the same target
        min_change_delta: z.number().nonnegative().default(0.01)
    }),

    // flat LMB / vr trigger, avoids a round trip per shot for guns
    z.object({
        type: z.literal("on-use"),
        require_held: z.boolean().default(true),
        cooldown_ms: z.number().nonnegative().default(0)
    })
]);
export type RaycastTrigger = z.infer<typeof RaycastTriggerSchema>;
export type RaycastTriggerInput = z.input<typeof RaycastTriggerSchema>;

export const RaycastRaysSchema = z.object({
    count: z.number().int().positive().default(1),

    // "cone" distributes evenly within angle_deg
    // "ring" puts them all at angle_deg
    pattern: z.enum(["cone", "ring"]).default("cone"),
    angle_deg: z.number().nonnegative().default(0),
    // 0 keeps the pattern exact. > 0 jitters each ray within this many
    // degrees of its slot, seeded so it stays reproducible
    jitter_deg: z.number().nonnegative().default(0),
    seed: z.number().int().optional()
});
export type RaycastRays = z.infer<typeof RaycastRaysSchema>;
export type RaycastRaysInput = z.input<typeof RaycastRaysSchema>;

export const RaycastInteractionSchema = bindable({
    type: z.literal("raycast"),
    enabled: z.boolean().default(true),

    origin: z
        .object({
            offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
            rotation: RotationSchema.default([0, 0, 0])
        })
        .optional(),

    aim: RaycastAimSchema.default({ type: "direction" } as RaycastAim),
    targets: RaycastTargetsSchema.default({} as RaycastTargets),
    trigger: RaycastTriggerSchema.default({ type: "manual" }),

    // 0 is a true ray. > 0 sphere-casts instead, for forgiving aim
    thickness: z.number().nonnegative().default(0),

    min_distance: z.number().nonnegative().default(0),

    rays: RaycastRaysSchema.default({} as RaycastRays),

    report_hits: z.boolean().default(true),
    report_misses: z.boolean().default(false),

    // enter/exit style: fires when the hit target changes, for hover and lasers
    report_target_changes: z.boolean().default(false)
});
export type RaycastInteraction = z.infer<typeof RaycastInteractionSchema>;
export type RaycastInteractionInput = z.input<typeof RaycastInteractionSchema>;

export const InteractionSchema = z.discriminatedUnion("type", [
    GrabbableInteractionSchema,
    TriggerVolumeInteractionSchema,
    FollowPlayerInteractionSchema,
    PositionalAudioInteractionSchema,
    GlobalAudioInteractionSchema,
    PointLightInteractionSchema,
    SpotLightInteractionSchema,
    DirectionalLightInteractionSchema,
    ParticleEmitterInteractionSchema,
    SeatInteractionSchema,
    RaycastInteractionSchema
]);
export type Interaction = z.infer<typeof InteractionSchema>;
export type InteractionInput = z.input<typeof InteractionSchema>;

export type BindableInteraction =
    | GrabbableInteraction
    | TriggerVolumeInteraction
    | FollowPlayerInteraction
    | PositionalAudioInteraction
    | GlobalAudioInteraction
    | PointLightInteraction
    | SpotLightInteraction
    | DirectionalLightInteraction
    | ParticleEmitterInteraction
    | SeatInteraction;
