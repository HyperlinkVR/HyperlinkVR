import {z} from "zod";

export const HexNumericalColorSchema = z.number().int().min(0).max(0xffffff);
export type HexNumericalColor = z.infer<typeof HexNumericalColorSchema>;
export const HexStringColorSchema = z.string().regex(/^#([0-9a-fA-F]{6})$/);
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
}).pipe(HexNumericalColorSchema);
export type HexColor = z.infer<typeof HexColorSchema>;
