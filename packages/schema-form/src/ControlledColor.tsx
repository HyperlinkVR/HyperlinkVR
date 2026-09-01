import { ColorInput } from "@mantine/core";

import { type FieldOverrideProps } from "./SimpleField";

// how the form value should be represented: a number (0xRRGGBB) or a "#rrggbb"
// string. the picker always works in hex; we convert on the way in and out.
export type ColorFormat = "number" | "string";

const to_hex = (value: any): string => {
    if (typeof value === "number") return `#${value.toString(16).padStart(6, "0")}`;
    if (typeof value === "string") return value;
    return "";
};

// color picker for fields marked with the `color` widget. driven by the generic
// value/set_value api so it slots in as a field override.
export const ControlledColor = ({
    value,
    set_value,
    label,
    error,
    format
}: FieldOverrideProps & { format: ColorFormat }) => {
    return (
        <ColorInput
            label={label}
            error={error}
            format="hex"
            value={to_hex(value)}
            onChange={(hex) => {
                if (!hex) {
                    set_value(undefined);
                } else if (format === "number") {
                    set_value(parseInt(hex.replace("#", ""), 16));
                } else {
                    set_value(hex);
                }
            }}
        />
    );
};
