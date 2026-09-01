import { type AutoFormFieldProps } from "@autoform/react";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useController } from "react-hook-form";

// lets field components raise/clear submit-blocking errors and confirm-on-submit
// warnings, keyed by field path. SchemaForm provides the implementation.
export interface FieldStatusApi {
    report_error: (path: string, message: string | null) => void;
    report_warning: (path: string, message: string | null) => void;
}

export const FieldStatusContext = createContext<FieldStatusApi>({
    report_error: () => {},
    report_warning: () => {}
});

// simplified props handed to a field_overrides component so it doesn't have to
// touch the autoform / react-hook-form api directly. `field` is kept as an
// escape hatch for anyone that needs the raw autoform props.
export interface FieldOverrideProps<T = any> {
    value: T;
    set_value: (value: T) => void;
    id: string;
    label?: string;
    // zod validation error for this field, if any
    error?: string;
    // raise (message) or clear (null) a submit-blocking error for this field
    set_error: (message: string | null) => void;
    // raise (message) or clear (null) a warning; warnings must be confirmed before submit
    set_warning: (message: string | null) => void;
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
        const status = useContext(FieldStatusContext);

        const set_error = useCallback(
            (message: string | null) => status.report_error(props.id, message),
            [status, props.id]
        );
        const set_warning = useCallback(
            (message: string | null) => status.report_warning(props.id, message),
            [status, props.id]
        );

        // clear this field's status on true unmount only (e.g. removed array item).
        // reading through refs keeps the effect deps empty so it never re-runs mid-
        // life and toggles the status off (which would loop against a field that
        // re-raises it every render).
        const status_ref = useRef(status);
        status_ref.current = status;
        const id_ref = useRef(props.id);
        id_ref.current = props.id;
        useEffect(
            () => () => {
                status_ref.current.report_error(id_ref.current, null);
                status_ref.current.report_warning(id_ref.current, null);
            },
            []
        );

        return (
            <Component
                value={rhfField.value}
                set_value={rhfField.onChange}
                id={props.id}
                label={props.label}
                error={fieldState.error?.message}
                set_error={set_error}
                set_warning={set_warning}
                field={props}
            />
        );
    };
};
