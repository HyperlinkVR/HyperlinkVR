import {z} from "zod";

import {RotationSchema, Vector3Schema} from "./transforms";

import {bindable} from "./binding";
import {AbsoluteAssetURLSchema} from "./assets";

// TODO: collider combo?

const BaseColliderSchema = z.object({
    type: z.string(),
    offset: Vector3Schema.optional(),
    rotation: RotationSchema.optional()
});
export const BoxColliderSchema = BaseColliderSchema.extend({
    type: z.literal("box"),
    size: z.tuple([z.number(), z.number(), z.number()])
});
export type BoxCollider = z.infer<typeof BoxColliderSchema>;
export const SphereColliderSchema = BaseColliderSchema.extend({
    type: z.literal("sphere"),
    radius: z.number().positive()
});
export type SphereCollider = z.infer<typeof SphereColliderSchema>;
export const CapsuleColliderSchema = BaseColliderSchema.extend({
    type: z.literal("capsule"),
    radius: z.number().positive(),
    height: z.number().positive()
});
export type CapsuleCollider = z.infer<typeof CapsuleColliderSchema>;
export const CylinderColliderSchema = BaseColliderSchema.extend({
    type: z.literal("cylinder"),
    radius: z.number().positive(),
    height: z.number().positive()
});
export type CylinderCollider = z.infer<typeof CylinderColliderSchema>;
export const CustomMeshApproximationSchema = z.enum(["hull", "trimesh"]).default("hull");
export type CustomMeshApproximation = z.infer<typeof CustomMeshApproximationSchema>;
export const CustomMeshColliderSchema = BaseColliderSchema.extend({
    type: z.literal("custom-mesh"),
    mesh: AbsoluteAssetURLSchema,
    approximation: CustomMeshApproximationSchema.optional()
});
export type CustomMeshCollider = z.infer<typeof CustomMeshColliderSchema>;
export const MeshApproximationSchema = z
    .enum(["hull", "trimesh", "cuboid", "ball"])
    .default("hull");
export type MeshApproximation = z.infer<typeof MeshApproximationSchema>;
export const AutoColliderSchema = BaseColliderSchema.extend({
    type: z.literal("auto"),
    approximation: MeshApproximationSchema.optional()
});
export type AutoCollider = z.infer<
    typeof AutoColliderSchema
>;
export const ColliderSchema = z.discriminatedUnion("type", [
    BoxColliderSchema,
    SphereColliderSchema,
    CapsuleColliderSchema,
    CylinderColliderSchema,
    CustomMeshColliderSchema,
    AutoColliderSchema
]);
export type Collider = z.infer<typeof ColliderSchema>;

const AxisLockSchema = z.object({
    x: z.boolean().default(false),
    y: z.boolean().default(false),
    z: z.boolean().default(false)
});

export type AxisLock = z.infer<typeof AxisLockSchema>;
export type AxisLockInput = z.input<typeof AxisLockSchema>;

const AxisLocksConstraintSchema = z.object({
    type: z.literal("axis-locks"),
    translation: AxisLockSchema.optional(),
    rotation: AxisLockSchema.optional()
});
export type AxisLocksConstraint = z.infer<typeof AxisLocksConstraintSchema>;

export const HingeConstraintSchema = z.object({
    type: z.literal("hinge"),
    axis: z.enum(["x", "y", "z"]),
    limits: z.object({min: z.number(), max: z.number()}).optional(),
    spring: z
        .object({
            target: z.number().default(0),
            stiffness: z.number(),
            damping: z.number()
        })
        .optional()
});
export type HingeConstraint = z.infer<typeof HingeConstraintSchema>;

export const BodyConstraintSchema = z.discriminatedUnion("type", [
    AxisLocksConstraintSchema,
    HingeConstraintSchema
]);
export type BodyConstraint = z.infer<typeof BodyConstraintSchema>;
export type BodyConstraintInput = z.input<typeof BodyConstraintSchema>;

const BaseRigidBodySchema = z.object({
    restitution: z.number().optional(),
    restitution_combine_rule: z.enum(["average", "min", "max", "multiply"]).default("average").optional(),
    friction: z.number().optional(),
    linear_damping: z.number().optional(),
    angular_damping: z.number().optional(),
    collider: ColliderSchema.optional()
});
export const FixedRigidBodySchema = BaseRigidBodySchema.extend({
    type: z.literal("fixed")
});
export type FixedRigidBody = z.infer<typeof FixedRigidBodySchema>;
export type FixedRigidBodyInput = z.input<typeof FixedRigidBodySchema>;
export const DynamicRigidBodySchema = BaseRigidBodySchema.extend({
    type: z.literal("dynamic"),
    mass: z.number().positive(),
    gravity_scale: z.number().optional(),
    ccd: z.boolean().optional(),
    velocity: Vector3Schema.optional(),
    angular_velocity: Vector3Schema.optional(),
    constraint: BodyConstraintSchema.optional()
});
export type DynamicRigidBody = z.infer<typeof DynamicRigidBodySchema>;
export type DynamicRigidBodyInput = z.input<typeof DynamicRigidBodySchema>;
export const KinematicPositionRigidBodySchema = BaseRigidBodySchema.extend({
    type: z.literal("kinematic-pos")
});
export type KinematicPositionRigidBody = z.infer<typeof KinematicPositionRigidBodySchema>;
export type KinematicPositionRigidBodyInput = z.input<typeof KinematicPositionRigidBodySchema>;
export const KinematicVelocityRigidBodySchema = BaseRigidBodySchema.extend({
    type: z.literal("kinematic-vel"),
    velocity: Vector3Schema,
    angular_velocity: Vector3Schema.optional()
});
export type KinematicVelocityRigidBody = z.infer<typeof KinematicVelocityRigidBodySchema>;
export type KinematicVelocityRigidBodyInput = z.input<typeof KinematicVelocityRigidBodySchema>;
export const RigidBodySchema = z.discriminatedUnion("type", [
    FixedRigidBodySchema,
    DynamicRigidBodySchema,
    KinematicPositionRigidBodySchema,
    KinematicVelocityRigidBodySchema
]);
export type RigidBody = z.infer<typeof RigidBodySchema>;
export type RigidBodyInput = z.input<typeof RigidBodySchema>;
export type RigidBodyType = RigidBody["type"];
export const PhysicsSystemSchema = bindable({
    rigid_body: RigidBodySchema.optional(),
    //joints: // to be added later
    report_collisions: z.boolean().default(false).optional(),
    // report_motion: z.boolean().default(false)
});
export type PhysicsSystem = z.infer<typeof PhysicsSystemSchema>;
export type PhysicsSystemInput = z.input<typeof PhysicsSystemSchema>;
