import {z} from "zod";

import {bindable} from "./binding";
import {AxisRangeSchema} from "./object_monitors";

export const SubjectRefSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("object"),
        id: z.string()
    }),
    z.object({
        kind: z.literal("player"),
        username: z.string().nullable().default(null)
    })
]);
export type SubjectRef = z.infer<typeof SubjectRefSchema>;
export type SubjectRefInput = z.input<typeof SubjectRefSchema>;

// scalar distance with optional plane
// TODO: exact vector support?
export const DistanceMonitorSchema = bindable({
    type: z.literal("distance"),
    a: SubjectRefSchema,
    b: SubjectRefSchema,
    range: AxisRangeSchema,
    plane: z.enum(["xyz", "xz", "y"]).default("xyz"),
    report_enter: z.boolean().default(true),
    report_exit: z.boolean().default(true),
    // once inside, the distance has to move this far back past the edge before an exit fires, so hovering exactly on the boundary doesn't spam enter/exit
    hysteresis: z.number().min(0).default(0)
});
export type DistanceMonitor = z.infer<typeof DistanceMonitorSchema>;
export type DistanceMonitorInput = z.input<typeof DistanceMonitorSchema>;

export const WorldMonitorSchema = z.discriminatedUnion("type", [
    DistanceMonitorSchema
]);
export type WorldMonitor = z.infer<typeof WorldMonitorSchema>;
export type WorldMonitorInput = z.input<typeof WorldMonitorSchema>;
