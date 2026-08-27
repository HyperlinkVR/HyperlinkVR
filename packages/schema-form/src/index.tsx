import { AutoForm } from "@autoform/mantine";
import { fieldConfig, ZodProvider } from "@autoform/zod";
import { MantineProvider } from "@mantine/core";
import { useCallback, useMemo } from "react";
import { z } from "zod";

import "./SchemaForm.css";

import { ControlledSelect } from "./ControlledSelect";

// TODO: autoform has been patched, might be able to switch back off controlledselect to default
export const SchemaForm = ({
    schema,
    title = "Schema Form",
    onSubmit,
    defaultValues = {},
    defaultConstValues = {},
    extraHiddenFields = [],
    visibleConstFields = []
}: {
    schema: z.ZodObject;
    title?: string;
    onSubmit: (data: any) => void;
    defaultValues?: Record<string, any>;
    defaultConstValues?: Record<string, any>;
    extraHiddenFields?: string[];
    visibleConstFields?: string[];
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

    // use fieldConfig to mark const fields as hidden
    const filtered_schema = useMemo(() => {
        const current_shape = schema.shape;
        const modified_fields = {} as Record<string, z.ZodTypeAny>;

        const hidden = [
            ...Object.keys(const_fields).filter(
                (key) => !visibleConstFields.includes(key)
            ),
            ...extraHiddenFields
        ];

        hidden.forEach((key) => {
            if (current_shape[key]) {
                modified_fields[key] = current_shape[key].check(
                    fieldConfig({
                        fieldWrapper: () => null
                    })
                );
            }
        });

        return schema.safeExtend(modified_fields);
    }, [schema, const_fields, extraHiddenFields, visibleConstFields]);
    // TODO: allow defining longer string field which sets inputProps size and inputSize

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
                        hidden: () => null
                    }}
                />
            </main>
        </MantineProvider>
    );
};
