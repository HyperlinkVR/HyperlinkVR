import { type AutoFormFieldProps } from "@autoform/react";
import { TextInput } from "@mantine/core";
import { useController } from "react-hook-form";

// autoform's default number field spreads react-hook-form's `register`, which
// stores the raw input string. that means `z.number()` sees a string and fails
// validation. this controlled version coerces to a real number on change so the
// form state (and submitted data) is numeric.
export const ControlledNumber = ({ field, ...props }: AutoFormFieldProps) => {
    const { field: rhfField, fieldState } = useController({
        name: props.id
    });

    return (
        <TextInput
            {...props}
            {...rhfField}
            type="number"
            description={field.fieldConfig?.description}
            error={fieldState.error?.message}
            value={rhfField.value ?? ""}
            onChange={(e) => {
                // empty -> undefined so optional numbers stay unset instead of NaN
                const raw = e.currentTarget.value;
                rhfField.onChange(raw === "" ? undefined : e.currentTarget.valueAsNumber);
            }}
        />
    );
};
