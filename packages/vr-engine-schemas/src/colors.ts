import {z} from "zod";

// `widget`/`color_format` are UI hints consumed by schema-form to render a color
// picker. color_format tells the form which representation to emit on change.
export const HexNumericalColorSchema = z.number().int().min(0).max(0xffffff)
    .meta({ widget: "color", color_format: "number" });
export type HexNumericalColor = z.infer<typeof HexNumericalColorSchema>;
export const HexStringColorSchema = z.string().regex(/^#([0-9a-fA-F]{6})$/)
    .meta({ widget: "color", color_format: "string" });
export type HexStringColor = z.infer<typeof HexStringColorSchema>;

// only send numerical color to the engine (unless specifically asking for a string) as threejs works in numbers and we want to avoid unnecessary conversions
export const HexColorSchema = z.union([HexNumericalColorSchema, HexStringColorSchema]).transform((val) => {
    if (typeof val === "number") {
        return val;
    } else if (typeof val === "string") {
        return parseInt(val.slice(1), 16);
    } else {
        throw new Error("Invalid color value");
    }
}).pipe(HexNumericalColorSchema)
    // input accepts a hex string, so the picker emits a string (transforms to number on parse)
    .meta({ widget: "color", color_format: "string" });
export type HexColor = z.infer<typeof HexColorSchema>;
