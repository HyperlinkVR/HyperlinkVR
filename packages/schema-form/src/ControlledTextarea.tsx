import { type AutoFormFieldProps } from "@autoform/react";
import { Textarea } from "@mantine/core";
import { useController } from "react-hook-form";

// multi-line string field. autoform's default string field is always a
// single-line TextInput; this renders a Mantine Textarea instead. selected via
// the `textarea` fieldType, which SchemaForm assigns to long string fields
// (inferred from maxLength) or to fields listed in `large_text_fields`.
export const ControlledTextarea = ({ field, label, ...props }: AutoFormFieldProps) => {
    const { field: rhfField, fieldState } = useController({
        name: props.id
    });

    return (
        <Textarea
            label={label}
            description={field.fieldConfig?.description}
            error={fieldState.error?.message}
            autosize
            minRows={3}
            maxRows={10}
            value={rhfField.value ?? ""}
            onChange={(e) => rhfField.onChange(e.currentTarget.value)}
            onBlur={rhfField.onBlur}
            ref={rhfField.ref}
        />
    );
};
