import { type AutoFormFieldProps } from "@autoform/react";
import { Select } from "@mantine/core";
import { useMemo } from "react";
import { useController } from "react-hook-form";

// https://github.com/vantezzen/autoform/issues/201
// controlled Select: mantine wants `value: string | null`. passing "" for an
// unselected optional field (where "" isn't an option) makes the combobox loop
// trying to reconcile the selection in a layout effect — use null instead. also
// memoize `data` so autoform's per-render re-parse doesn't hand mantine a new
// array every render.
export const ControlledSelect = ({ field, label, ...props }: AutoFormFieldProps) => {
    const { field: rhfField, fieldState } = useController({
        name: props.id
    });

    const data = useMemo(
        () => (field.options || []).map(([value, option_label]) => ({ value, label: option_label })),
        // options are constant per field; key off the field path to keep identity stable
        [props.id] // eslint-disable-line react-hooks/exhaustive-deps
    );

    return (
        <Select
            id={props.id}
            label={label}
            description={field.fieldConfig?.description}
            data={data}
            error={fieldState.error?.message}
            value={rhfField.value ?? null}
            onChange={(val) => rhfField.onChange(val ?? undefined)}
            onBlur={rhfField.onBlur}
            name={rhfField.name}
            ref={rhfField.ref}
        />
    );
};
