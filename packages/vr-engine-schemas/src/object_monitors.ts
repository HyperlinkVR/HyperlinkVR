import {z} from "zod";

import {bindable} from "./binding";

export const AxisRangeSchema = z.union([
    z.object({
        min: z.number(),
        max: z.number()
    }),
    z.object({
        min: z.number(),
    }),
    z.object({
        max: z.number(),
    }),
    z.object({
        equals: z.number()
    })
]);
export type AxisRange = z.infer<typeof AxisRangeSchema>;
export const AxesBasedMonitorSchema = bindable({
    type: z.enum(["position", "rotation", "linear-velocity", "angular-velocity"]),
    when: z.enum(["any", "all", "xor"]).default("all"),
    continuous: z.object({
        enabled: z.boolean().default(false),
        ignored_unchanged: z.boolean().default(true),
        min_change_delta: z.number().min(0).default(0.001),
    }).optional(),
    x: AxisRangeSchema.optional(),
    y: AxisRangeSchema.optional(),
    z: AxisRangeSchema.optional()
});
export type AxesBasedMonitor = z.infer<typeof AxesBasedMonitorSchema>;
export type AxesBasedMonitorInput = z.input<typeof AxesBasedMonitorSchema>;
export const PositionMonitorSchema = AxesBasedMonitorSchema.extend({
    type: z.literal("position"),
});
export type PositionMonitor = z.infer<typeof PositionMonitorSchema>;
export type PositionMonitorInput = z.input<typeof PositionMonitorSchema>;
export const RotationMonitorSchema = AxesBasedMonitorSchema.extend({
    type: z.literal("rotation"),
});
export type RotationMonitor = z.infer<typeof RotationMonitorSchema>;
export type RotationMonitorInput = z.input<typeof RotationMonitorSchema>;
export const LinearVelocityMonitorSchema = AxesBasedMonitorSchema.extend({
    type: z.literal("linear-velocity"),
});
export type LinearVelocityMonitor = z.infer<typeof LinearVelocityMonitorSchema>;
export type LinearVelocityMonitorInput = z.input<typeof LinearVelocityMonitorSchema>;
export const AngularVelocityMonitorSchema = AxesBasedMonitorSchema.extend({
    type: z.literal("angular-velocity"),
});
export type AngularVelocityMonitor = z.infer<typeof AngularVelocityMonitorSchema>;
export type AngularVelocityMonitorInput = z.input<typeof AngularVelocityMonitorSchema>;
export const ObjectMonitorSchema = z.discriminatedUnion("type", [
    PositionMonitorSchema,
    RotationMonitorSchema,
    LinearVelocityMonitorSchema,
    AngularVelocityMonitorSchema
]);
export type ObjectMonitor = z.infer<typeof ObjectMonitorSchema>;
export type ObjectMonitorInput = z.input<typeof ObjectMonitorSchema>;
