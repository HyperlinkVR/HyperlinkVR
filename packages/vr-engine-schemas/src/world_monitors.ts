import {z} from "zod";

import {bindable} from "./binding";
import {AxisRangeSchema} from "./object_monitors";

// a concrete, resolved endpoint: always exactly one thing. this is what a report
// carries to say who the pair was. objects and players are interchangeable.
export const SubjectRefSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("object"),
        id: z.string()
    }),
    z.object({
        kind: z.literal("player"),
        // null (the default) is the local player. named players are reserved for multiplayer.
        username: z.string().nullable().default(null)
    })
]);
export type SubjectRef = z.infer<typeof SubjectRefSchema>;
export type SubjectRefInput = z.input<typeof SubjectRefSchema>;

// what a monitor watches: one specific subject, or a wildcard set resolved live
// every frame. a wildcard end fans the monitor out to one tracked pair per match,
// so an enemy vs "any-player" reports each player crossing independently.
export const TargetRefSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("object"),
        id: z.string()
    }),
    z.object({
        kind: z.literal("player"),
        username: z.string().nullable().default(null)
    }),
    z.object({kind: z.literal("any-object")}),
    z.object({kind: z.literal("any-player")}),
    z.object({kind: z.literal("any")})
]);
export type TargetRef = z.infer<typeof TargetRefSchema>;
export type TargetRefInput = z.input<typeof TargetRefSchema>;

// scalar distance with optional plane
// TODO: exact vector support?
export const DistanceMonitorSchema = bindable({
    type: z.literal("distance"),
    a: TargetRefSchema,
    b: TargetRefSchema,
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
