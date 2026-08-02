import {z} from "zod";

import {bindable} from "./binding";

// consolidated buttons already exposed from flat input
export const InputActionSchema = z.enum([
    "use",
    "grab",
    "jump",
    "sprint",
    "throw",
    "menu",
    "primary",
    "secondary"
]);
export type InputAction = z.infer<typeof InputActionSchema>;


// consolidated axes that respect locomotion hand settings
export const AxisActionSchema = z.enum([
    "move", // 2d, -1..1 per component, +y forward
    "look" // 2d, normalised to rad/s of applied yaw/pitch so flat and vr agree
]);
export type AxisAction = z.infer<typeof AxisActionSchema>;


const RawXRButtonSchema = z.object({
    kind: z.literal("raw"),
    scheme: z.literal("xr"),
    hand: z.enum(["left", "right", "either"]),
    code: z.string() // "xr-standard-trigger", "a-button", etc
});

const RawGamepadButtonSchema = z.object({
    kind: z.literal("raw"),
    scheme: z.literal("gamepad"),
    code: z.string() // StandardControllerInput member, e.g. "FACE_BOTTOM"
});

const RawKeyboardButtonSchema = z.object({
    kind: z.literal("raw"),
    scheme: z.literal("kbm"),
    code: z.string() // KeyboardEvent.code, e.g. "KeyE", or "Mouse0"
});

export const ButtonSourceSchema = z.union([
    z.object({kind: z.literal("action"), action: InputActionSchema}),
    RawXRButtonSchema,
    RawGamepadButtonSchema,
    RawKeyboardButtonSchema
]);
export type ButtonSource = z.infer<typeof ButtonSourceSchema>;

const RawXRAxisSchema = z.object({
    kind: z.literal("raw"),
    scheme: z.literal("xr"),
    hand: z.enum(["left", "right"]),
    // thumbstick and touchpad fill x and y, trigger and grip fill x only
    control: z.enum(["thumbstick", "touchpad", "trigger", "grip"])
});

const RawGamepadAxisSchema = z.object({
    kind: z.literal("raw"),
    scheme: z.literal("gamepad"),
    control: z.enum([
        "left-stick",
        "right-stick",
        "left-trigger",
        "right-trigger"
    ])
});

const RawKeyboardAxisSchema = z.object({
    kind: z.literal("raw"),
    scheme: z.literal("kbm"),
    control: z.enum(["wasd", "mouse-delta"])
});

export const AxisSourceSchema = z.union([
    z.object({kind: z.literal("action"), action: AxisActionSchema}),
    RawXRAxisSchema,
    RawGamepadAxisSchema,
    RawKeyboardAxisSchema
]);
export type AxisSource = z.infer<typeof AxisSourceSchema>;

export const ButtonInputMonitorSchema = bindable({
    type: z.literal("button-input"),
    source: ButtonSourceSchema,
    report_press: z.boolean().default(true),
    report_release: z.boolean().default(false),
    // fires once after the button has been down this long, for charge/long-press
    report_hold_seconds: z.number().positive().optional()
});
export type ButtonInputMonitor = z.infer<typeof ButtonInputMonitorSchema>;
export type ButtonInputMonitorInput = z.input<typeof ButtonInputMonitorSchema>;

export const AxisInputMonitorSchema = bindable({
    type: z.literal("axis-input"),
    source: AxisSourceSchema,
    min_change_delta: z.number().min(0).default(0.02),
    max_report_hz: z.number().positive().default(20),
    report_settle: z.boolean().default(true)
});
export type AxisInputMonitor = z.infer<typeof AxisInputMonitorSchema>;
export type AxisInputMonitorInput = z.input<typeof AxisInputMonitorSchema>;

export const PlayerMonitorSchema = z.discriminatedUnion("type", [
    ButtonInputMonitorSchema,
    AxisInputMonitorSchema
]);
export type PlayerMonitor = z.infer<typeof PlayerMonitorSchema>;
export type PlayerMonitorInput = z.input<typeof PlayerMonitorSchema>;
