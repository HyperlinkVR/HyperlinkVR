import { AutoForm } from "@autoform/mantine";
import { fieldConfig, ZodProvider } from "@autoform/zod";
import { MantineProvider } from "@mantine/core";
import { useCallback, useMemo } from "react";
import { z } from "zod";

import "./SchemaForm.css";

import { ControlledSelect } from "./ControlledSelect";
import { ControlledNumber } from "./ControlledNumber";
import { wrap_field_override, type FieldOverrideProps } from "./SimpleField";

export type { FieldOverrideProps };

// zod wrappers (optional/nullable/default/readonly) hide the inner object/array behind a `.def.innerType`. unwrap them so we can traverse into nested fields
const unwrap_schema = (schema: any): any => {
    let current = schema;
    while (
        current instanceof z.ZodOptional ||
        current instanceof z.ZodNullable ||
        current instanceof z.ZodDefault ||
        current instanceof z.ZodReadonly
    ) {
        current = current.def.innerType;
    }
    return current;
};

// TODO: autoform has been patched, might be able to switch back off controlledselect to default
export const SchemaForm = ({
    schema,
    title = "Schema Form",
    onSubmit,
    defaultValues = {},
    defaultConstValues = {},
    extraHiddenFields = [],
    visibleConstFields = [],
    field_overrides = {}
}: {
    schema: z.ZodObject;
    title?: string;
    onSubmit: (data: any) => void;
    defaultValues?: Record<string, any>;
    defaultConstValues?: Record<string, any>;
    extraHiddenFields?: string[];
    visibleConstFields?: string[];
    field_overrides?: Record<string, React.ComponentType<FieldOverrideProps<any>>>;
}) => {
    const const_fields = useMemo(() => {
        const fields: Record<string, any> = { ...defaultConstValues };
        Object.entries(schema.shape).forEach(([key, value]) => {
            if (value instanceof z.ZodLiteral) {
                fields[key] = value.value;
            }

            // if a version field is provided with a range, set it to the max value
            if (key === "version" && value instanceof z.ZodNumber) {
                const max = value.maxValue;
                if (max !== undefined) {
                    fields[key] = max;
                }
            }

            // $schema is constant
            if (key === "$schema" && value instanceof z.ZodDefault) {
                fields[key] = value.def.defaultValue;
            }
        });

        return fields;
    }, [schema, defaultConstValues]);

    const get_nested_schema_key = useCallback(
        (key: string) => {
            console.log("Getting nested schema key for", key);
            const parts = key.split(".");
            let current_schema: any = schema;
            for (let part_idx = 0; part_idx < parts.length; part_idx++) {
                const part = parts[part_idx];
                // peel optional/nullable/default/readonly wrappers before descending
                current_schema = unwrap_schema(current_schema);
                if (current_schema instanceof z.ZodObject) {
                    current_schema = current_schema.shape[part!];
                } else if (current_schema instanceof z.ZodArray) {
                    current_schema = current_schema.element;
                } else if (current_schema instanceof z.ZodAny) {
                    // if this is the last part, return it, otherwise return null
                    if (part_idx === parts.length - 1) {
                        console.log("Found schema for", key, current_schema);
                        return current_schema;
                    } else {
                        console.warn(`Schema for ${key} is ZodAny, but there are more parts in the key. Returning null.`);
                        return null;
                    }
                }
            }
            return current_schema;
        },
        [schema]
    );

    // use fieldConfig to mark const fields as hidden, and to apply custom field overrides without the schemas needing to know about autoform
    const filtered_schema = useMemo(() => {
        const modified_fields = {} as Record<string, z.ZodTypeAny>;

        const apply_at_path = (
            original: z.ZodTypeAny | undefined,
            parts: string[],
            field_schema: z.ZodTypeAny
        ): z.ZodTypeAny => {
            if (parts.length === 0) {
                return field_schema;
            }
            if (original instanceof z.ZodOptional) {
                return apply_at_path(original.def.innerType, parts, field_schema).optional();
            }
            if (original instanceof z.ZodNullable) {
                return apply_at_path(original.def.innerType, parts, field_schema).nullable();
            }
            if (original instanceof z.ZodDefault) {
                return apply_at_path(original.def.innerType, parts, field_schema).default(
                    original.def.defaultValue
                );
            }
            if (original instanceof z.ZodReadonly) {
                return apply_at_path(original.def.innerType, parts, field_schema).readonly();
            }
            if (original instanceof z.ZodObject) {
                const [head, ...rest] = parts;
                return original.safeExtend({
                    [head!]: apply_at_path(original.shape[head!], rest, field_schema)
                });
            }
            // arrays / unknown: cannot descend without dropping constraints
            console.warn("Could not descend into schema to apply nested field", original);
            return original ?? field_schema;
        };

        const set_nested_modified_field = (key: string, field_schema: z.ZodTypeAny) => {
            const parts = key.split(".");
            const top = parts[0]!;
            const base = modified_fields[top] ?? schema.shape[top];
            modified_fields[top] = apply_at_path(base, parts.slice(1), field_schema);
        }

        const hidden = [
            ...Object.keys(const_fields).filter(
                (key) => !visibleConstFields.includes(key)
            ),
            ...extraHiddenFields
        ];

        hidden.forEach((key) => {
            const field_schema = get_nested_schema_key(key);
            if (field_schema) {
                set_nested_modified_field(
                    key,
                    field_schema.check(
                        fieldConfig({
                            fieldWrapper: () => null
                        })
                    )
                );
            } else {
                console.warn(`Hidden field for ${key} could not be applied because the field does not exist in the schema.`);
            }
        });

        Object.entries(field_overrides).forEach(([key]) => {
            const field_schema = get_nested_schema_key(key);
            if (field_schema) {
                set_nested_modified_field(
                    key,
                    field_schema.check(
                        fieldConfig({
                            fieldType: `custom-${key}`,
                        })
                    )
                );
            } else {
                console.warn(`Field override for ${key} could not be applied because the field does not exist in the schema.`);
            }
        });

        console.log("Modified fields", modified_fields);
        return schema.safeExtend(modified_fields);
    }, [schema, const_fields, extraHiddenFields, visibleConstFields, field_overrides, get_nested_schema_key]);
    // TODO: allow defining longer string field which sets inputProps size and inputSize

    console.log("Filtered schema", filtered_schema);

    const schema_provider = useMemo(
        () => new ZodProvider(filtered_schema),
        [filtered_schema]
    );

    const handle_submit = useCallback(
        (data: any) => {
            // enforce const fields
            const new_data = { ...data, ...const_fields };
            onSubmit(new_data);
        },
        [const_fields]
    );

    const custom_form_components = useMemo(() => {
        const components: Record<string, React.ComponentType<any>> = {};
        Object.entries(field_overrides).forEach(([key, component]) => {
            components[`custom-${key}`] = wrap_field_override(component);
        });
        return components;
    }, [field_overrides]);
    console.log("Custom form components", custom_form_components);

    return (
        <MantineProvider>
            <main style={{ margin: "2rem" }}>
                <h1>{title}</h1>

                <AutoForm
                    schema={schema_provider}
                    onSubmit={handle_submit}
                    defaultValues={{ ...defaultValues, ...const_fields }}
                    withSubmit
                    formComponents={{
                        select: ControlledSelect,
                        number: ControlledNumber,
                        hidden: () => null,
                        ...custom_form_components
                    }}
                />
            </main>
        </MantineProvider>
    );
};
