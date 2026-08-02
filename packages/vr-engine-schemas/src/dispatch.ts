import {z} from "zod";

import {PartialTransformSchema, TransformSchema} from "./transforms";
import {ObjectMonitorSchema} from "./object_monitors";
import {EngineObjectSchema} from "./objects";

export const EngineObjectDispatchSchema = z.object({
    object: EngineObjectSchema,
    transform: TransformSchema.default({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    }),
    user_data: z.record(z.string(), z.any()).optional(),
    monitors: z.array(ObjectMonitorSchema).optional(),
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
    tags: z.array(z.string()).optional()
});
export type EngineObjectModification = z.infer<typeof EngineObjectModificationSchema>;
export type EngineObjectModificationInput = z.input<typeof EngineObjectModificationSchema>;
