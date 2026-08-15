import { z } from "zod";
import {bindable} from "./binding";
import {HexColorSchema} from "./colors";

export const HUDSlotSchema = z.object({
    vertical: z.enum(["top", "middle", "bottom"]),
    horizontal: z.enum(["left", "center", "right"])
});
export type HUDSlot = z.infer<typeof HUDSlotSchema>;

export const HUDSlotShorthandSchema = z.enum([
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-center",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right"
]);
export type HUDSlotShorthand = z.infer<typeof HUDSlotShorthandSchema>;

const parse_hud_shorthand = (shorthand: HUDSlotShorthand): HUDSlot => {
    const [vertical, horizontal] = HUDSlotShorthandSchema.parse(shorthand).split("-");
    return { vertical, horizontal } as HUDSlot;
}

export const HUDSlotOrShorthandSchema = z.union([HUDSlotSchema, HUDSlotShorthandSchema])
    .transform((slot_or_shorthand): HUDSlot =>
        // normalise to HUDSlot
        typeof slot_or_shorthand === "string"
            ? parse_hud_shorthand(slot_or_shorthand)
            : slot_or_shorthand
    );
export type HUDSlotOrShorthand = z.infer<typeof HUDSlotOrShorthandSchema>;

const HUDComponentBaseSchema = bindable({
    type: z.string(),
});

export const HUDTextComponentSchema = HUDComponentBaseSchema.extend({
    type: z.literal("text"),
    text: z.string(),
    font_size: z.number().positive().optional().default(16),
    color: HexColorSchema.optional().default("#FFFFFF"),
});
export type HUDTextComponent = z.infer<typeof HUDTextComponentSchema>;
export type HUDTextComponentInput = z.input<typeof HUDTextComponentSchema>;

// will add more components later, just a test for now

export const HUDComponentSchema = z.discriminatedUnion("type", [
    HUDTextComponentSchema
]);
export type HUDComponent = z.infer<typeof HUDComponentSchema>;
export type HUDComponentInput = z.input<typeof HUDComponentSchema>;

// can provide a single username, an array of usernames (null means the local player)
const HUDScopeUsernamesSchema = z
    .union([
        z.string(),
        z.null(),
        z.array(z.union([z.string(), z.null()]))
    ])
    // normalise to array
    .transform((usernames) => Array.isArray(usernames) ? usernames : [usernames]);

export const HUDScopeSchema = z.union([
    z.literal("global"),
    z.object({
        type: z.literal("player"),
        usernames: HUDScopeUsernamesSchema
    })
]);
export type HUDScope = z.infer<typeof HUDScopeSchema>;

// flat hud is all one surface so only applies to vr
export const HUDVRAnchorSchema = z.enum([
    "origin", // glued to the player origin at a fixed height. moves with stick yaw, but not playspace movement and rotation
    "body", // similar positioning to origin, but follows playspace movement and yaw (with a lerp)
    "head" // glued to the face as an overlay. use sparingly as it can be disorienting or distracting
]);
export type HUDVRAnchor = z.infer<typeof HUDVRAnchorSchema>;

// TODO: belt anchor for hud that looks up? floor mounted hud?

export const HUDDispatchSchema = z.object({
    component: HUDComponentSchema,
    visible: z.boolean().default(true),
    slot: HUDSlotOrShorthandSchema,
    order: z.number().default(0),
    offset: z.tuple([z.number(), z.number()]).optional(),
    scope: HUDScopeSchema.default("global"),
    vr_anchor: HUDVRAnchorSchema.default("body")
});
export type HUDDispatch = z.infer<typeof HUDDispatchSchema>;
export type HUDDispatchInput = z.input<typeof HUDDispatchSchema>;

// TODO: a depth option? if not too annoying? could be per slot worst case

export const CreatedHUDElementSchema = HUDDispatchSchema.extend({
    id: z.string()
});
export type CreatedHUDElement = z.infer<typeof CreatedHUDElementSchema>;

export const HUDElementModificationSchema = z.object({
    id: z.string(),
    component: z.record(z.string(), z.unknown()).optional(),
    visible: z.boolean().optional(),
    slot: HUDSlotOrShorthandSchema.optional(),
    order: z.number().optional(),
    offset: z.tuple([z.number(), z.number()]).nullable().optional(),
    vr_anchor: HUDVRAnchorSchema.optional()
});
export type HUDElementModification = z.infer<typeof HUDElementModificationSchema>;
export type HUDElementModificationInput = z.input<typeof HUDElementModificationSchema>;
