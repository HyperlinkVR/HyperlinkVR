import { type AutoFormFieldProps } from "@autoform/react";
import { Checkbox } from "@mantine/core";
import { useController } from "react-hook-form";

// autoform's default boolean field spreads react-hook-form's `register` onto the
// Mantine Checkbox, which never wires up `checked`. the box then renders
// uncontrolled and its value can arrive as undefined, so a non-optional boolean
// reads as "required" until toggled. this controlled version keeps `checked` in
// sync with form state and always yields a real boolean.
export const ControlledCheckbox = ({ field, label, ...props }: AutoFormFieldProps) => {
    const { field: rhfField, fieldState } = useController({
        name: props.id
    });

    return (
        <Checkbox
            label={label}
            description={field.fieldConfig?.description}
            error={fieldState.error?.message}
            checked={!!rhfField.value}
            onChange={(e) => rhfField.onChange(e.currentTarget.checked)}
            onBlur={rhfField.onBlur}
            ref={rhfField.ref}
        />
    );
};
