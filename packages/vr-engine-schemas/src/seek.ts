import { z } from "zod";

export const SeekTargetSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("point"),  position: z.tuple([z.number(), z.number(), z.number()]) }),
    z.object({ kind: z.literal("object"), object_id: z.string() }),
    z.object({ kind: z.literal("player"), username: z.string().nullable() }),
]);
// TODO: seek any player, any object, or any subject (player or object) as a target with optional tag filter
export type SeekTarget = z.infer<typeof SeekTargetSchema>;
export type SeekTargetInput = z.input<typeof SeekTargetSchema>;

const BaseSeekConfigSchema = z.object({
    target: SeekTargetSchema,
    speed: z.number().positive(),
    mode: z.enum(["kinematic", "dynamic"]).default("kinematic"),
    strategy: z.enum(["direct", "predict"]).default("direct"),
    distance: z.number().min(0).default(0),
    stop_at_distance: z.boolean().default(false),
    lock_y: z.boolean().default(true),
    face_target: z.boolean().default(true),
});

export const DirectSeekConfigSchema = BaseSeekConfigSchema.extend({
    strategy: z.literal("direct"),
});
export type DirectSeekConfig = z.infer<typeof DirectSeekConfigSchema>;
export type DirectSeekConfigInput = z.input<typeof DirectSeekConfigSchema>;

export const PredictSeekConfigSchema = BaseSeekConfigSchema.extend({
    strategy: z.literal("predict"),
    lead_max: z.number().positive(),
});
export type PredictSeekConfig = z.infer<typeof PredictSeekConfigSchema>;
export type PredictSeekConfigInput = z.input<typeof PredictSeekConfigSchema>;

export const SeekConfigSchema = z.discriminatedUnion("strategy", [
    DirectSeekConfigSchema,
    PredictSeekConfigSchema,
]);
export type SeekConfig = z.infer<typeof SeekConfigSchema>;
export type SeekConfigInput = z.input<typeof SeekConfigSchema>;
