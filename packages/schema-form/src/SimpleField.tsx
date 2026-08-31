import { type AutoFormFieldProps } from "@autoform/react";
import { useController } from "react-hook-form";

// simplified props handed to a field_overrides component so it doesn't have to
// touch the autoform / react-hook-form api directly. `field` is kept as an
// escape hatch for anyone that needs the raw autoform props.
export interface FieldOverrideProps<T = any> {
    value: T;
    set_value: (value: T) => void;
    id: string;
    label?: string;
    error?: string;
    field: AutoFormFieldProps;
}

// adapt a FieldOverrideProps component into one autoform can render as a
// formComponents entry, wiring value/set_value through the form controller.
export const wrap_field_override = (
    Component: React.ComponentType<FieldOverrideProps>
): React.ComponentType<AutoFormFieldProps> => {
    return (props: AutoFormFieldProps) => {
        const { field: rhfField, fieldState } = useController({
            name: props.id
        });

        return (
            <Component
                value={rhfField.value}
                set_value={rhfField.onChange}
                id={props.id}
                label={props.label}
                error={fieldState.error?.message}
                field={props}
            />
        );
    };
};
