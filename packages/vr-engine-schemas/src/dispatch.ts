import {z} from "zod";

import {PartialTransformSchema, TransformSchema, Vector3Schema } from "./transforms";
import {ObjectMonitorSchema} from "./object_monitors";
import {EngineObjectSchema} from "./objects";
import {TriggerSchema} from "./triggers";
import {AnimationSchema} from "./animation";

export const EngineObjectDispatchSchema = z.object({
    object: EngineObjectSchema,
    transform: TransformSchema.default({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    }),
    user_data: z.record(z.string(), z.any()).optional(),
    monitors: z.array(ObjectMonitorSchema).optional(),
    triggers: z.array(TriggerSchema).optional(),
    tags: z.array(z.string()).optional()
});
export type EngineObjectDispatch = z.infer<typeof EngineObjectDispatchSchema>;
export type EngineObjectDispatchInput = z.input<typeof EngineObjectDispatchSchema>;
export const CreatedEngineObjectSchema = EngineObjectDispatchSchema.extend({
    id: z.string(),
    transform: TransformSchema // transform is guaranteed to be resolved now
});
export type CreatedEngineObject = z.infer<typeof CreatedEngineObjectSchema>;
export type CreatedEngineObjectInput = z.input<typeof CreatedEngineObjectSchema>;
export const EngineObjectModificationSchema = z.object({
    id: z.string(),
    transform: PartialTransformSchema.optional(),
    user_data: z.record(z.string(), z.any()).optional(),
    monitors: z.array(ObjectMonitorSchema).optional(),
    triggers: z.array(TriggerSchema).optional(),
    tags: z.array(z.string()).optional(),
    physics: z.object({
        velocity: Vector3Schema.optional(),
        angular_velocity: Vector3Schema.optional(),
        impulse: Vector3Schema.optional(),
        torque_impulse: Vector3Schema.optional()
    }).optional()
});
export type EngineObjectModification = z.infer<typeof EngineObjectModificationSchema>;
export type EngineObjectModificationInput = z.input<typeof EngineObjectModificationSchema>;

export const CreatedAnimationSchema = AnimationSchema.extend({
    id: z.string()
});
export type CreatedAnimation = z.infer<typeof CreatedAnimationSchema>;
