import { AutoForm } from "@autoform/mantine";
import { fieldConfig, ZodProvider } from "@autoform/zod";
import { Alert, Button, Group, MantineProvider, Modal, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import "./SchemaForm.css";

import { ControlledSelect } from "./ControlledSelect";
import { ControlledNumber } from "./ControlledNumber";
import { ControlledCheckbox } from "./ControlledCheckbox";
import { ControlledTextarea } from "./ControlledTextarea";
import { UnionField } from "./UnionField";
import { ControlledColor, type ColorFormat } from "./ControlledColor";
import { FieldStatusContext, wrap_field_override, type FieldOverrideProps } from "./SimpleField";
import { get_color_format, get_union_options, unwrap_schema } from "./schema_utils";

export type { FieldOverrideProps };

// string fields with a maxLength at or above this render as a textarea by default
const TEXTAREA_MAX_LENGTH_THRESHOLD = 128;

// fieldType assigned to auto-detected union fields, per path
const union_field_type = (path: string) => `union:${path}`;
// fieldType assigned to auto-detected color fields, per path
const color_field_type = (path: string) => `color:${path}`;

// @autoform/mantine's AutoForm defines its inner component inline, so it remounts
// its whole subtree on every re-render. we therefore keep every prop we pass to it
// referentially stable and memoize the element, so status-state changes in
// SchemaForm never re-render (and thus never remount) the form. these hoisted
// empties keep the omitted-prop defaults stable across renders.
const EMPTY_OBJECT: Record<string, any> = {};
const EMPTY_ARRAY: any[] = [];
const HIDDEN_COMPONENT = () => null;

// walk the schema collecting dotted paths of long string fields (array elements
// use the "[]" segment) so they can be rendered as textareas. keeps in step with
// get_nested_schema_key / apply_at_path which understand the same path syntax.
const collect_textarea_paths = (schema: any, prefix: string, acc: string[]) => {
    const current = unwrap_schema(schema);
    if (current instanceof z.ZodObject) {
        Object.entries(current.shape).forEach(([key, value]) => {
            collect_textarea_paths(value, prefix ? `${prefix}.${key}` : key, acc);
        });
    } else if (current instanceof z.ZodArray) {
        collect_textarea_paths(current.element, prefix ? `${prefix}.[]` : "[]", acc);
    } else if (current instanceof z.ZodString) {
        const max = current.maxLength;
        if (max != null && max >= TEXTAREA_MAX_LENGTH_THRESHOLD && prefix) {
            acc.push(prefix);
        }
    }
};

// walk the schema collecting union fields (path + branch option schemas) so they
// can be rendered by the generic UnionField instead of autoform's string
// fallback. stops descending at a union (its branches are handled by UnionField).
const collect_union_fields = (
    schema: any,
    prefix: string,
    acc: { path: string; options: any[] }[]
) => {
    const options = get_union_options(schema);
    if (options) {
        // only take over unions with an object or array branch, those are the ones
        // autoform's string fallback can't represent. primitive-only unions
        // (e.g. number | hex-string) are left as a plain input.
        const has_object_branch = options.some(
            (opt) => {
                const unwrapped = unwrap_schema(opt);
                return unwrapped instanceof z.ZodObject || unwrapped instanceof z.ZodArray;
            }
        );
        if (prefix && has_object_branch) acc.push({ path: prefix, options });
        return;
    }
    const current = unwrap_schema(schema);
    if (current instanceof z.ZodObject) {
        Object.entries(current.shape).forEach(([key, value]) => {
            collect_union_fields(value, prefix ? `${prefix}.${key}` : key, acc);
        });
    } else if (current instanceof z.ZodArray) {
        collect_union_fields(current.element, prefix ? `${prefix}.[]` : "[]", acc);
    }
};

// walk the schema collecting fields marked with the `color` widget so they render
// with a color picker. stops at a color field (it's a leaf as far as the form is
// concerned).
const collect_color_fields = (
    schema: any,
    prefix: string,
    acc: { path: string; format: ColorFormat }[]
) => {
    const format = get_color_format(schema);
    if (format) {
        if (prefix) acc.push({ path: prefix, format });
        return;
    }
    const current = unwrap_schema(schema);
    if (current instanceof z.ZodObject) {
        Object.entries(current.shape).forEach(([key, value]) => {
            collect_color_fields(value, prefix ? `${prefix}.${key}` : key, acc);
        });
    } else if (current instanceof z.ZodArray) {
        collect_color_fields(current.element, prefix ? `${prefix}.[]` : "[]", acc);
    }
};


// TODO: autoform has been patched, might be able to switch back off controlledselect to default
export const SchemaForm = ({
    schema,
    title = "Schema Form",
    onSubmit,
    defaultValues = EMPTY_OBJECT,
    defaultConstValues = EMPTY_OBJECT,
    extraHiddenFields = EMPTY_ARRAY,
    visibleConstFields = EMPTY_ARRAY,
    field_overrides = EMPTY_OBJECT,
    large_text_fields = EMPTY_ARRAY
}: {
    schema: z.ZodObject;
    title?: string;
    onSubmit: (data: any) => void;
    defaultValues?: Record<string, any>;
    defaultConstValues?: Record<string, any>;
    extraHiddenFields?: string[];
    visibleConstFields?: string[];
    field_overrides?: Record<string, React.ComponentType<FieldOverrideProps<any>>>;
    // paths to force-render as a textarea (dotted, "[]" for array elements). long
    // string fields are inferred automatically; this overrides/extends that guess.
    large_text_fields?: string[];
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

    // union fields autoform can't render natively; handled by the generic UnionField
    const auto_union_fields = useMemo(() => {
        const acc: { path: string; options: any[] }[] = [];
        collect_union_fields(schema, "", acc);
        return acc;
    }, [schema]);

    // fields marked with the `color` widget; handled by ControlledColor
    const auto_color_fields = useMemo(() => {
        const acc: { path: string; format: ColorFormat }[] = [];
        collect_color_fields(schema, "", acc);
        return acc;
    }, [schema]);

    const get_nested_schema_key = useCallback(
        (key: string) => {
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
            if (original instanceof z.ZodArray) {
                // the "[]" segment addresses the element; rebuild via clone so the
                // array's own checks (e.g. .max()) survive the element swap
                const [, ...rest] = parts;
                const new_element = apply_at_path((original as any).element, rest, field_schema);
                return (original as any).clone({ ...(original as any)._zod.def, element: new_element });
            }
            // unknown: cannot descend without dropping constraints
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
                            fieldWrapper: () => {}
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

        // render long string fields as textareas: inferred from maxLength, plus
        // any explicit large_text_fields. skip anything already hidden or given a
        // custom override so those take precedence.
        const inferred: string[] = [];
        collect_textarea_paths(schema, "", inferred);
        const textarea_keys = new Set([...inferred, ...large_text_fields]);
        textarea_keys.forEach((key) => {
            if (hidden.includes(key) || key in field_overrides) {
                return;
            }
            const field_schema = get_nested_schema_key(key);
            if (field_schema) {
                set_nested_modified_field(
                    key,
                    field_schema.check(fieldConfig({ fieldType: "textarea" }))
                );
            } else {
                console.warn(`Textarea field for ${key} could not be applied because the field does not exist in the schema.`);
            }
        });

        // render detected unions with the generic UnionField, unless the field is
        // hidden or the caller supplied their own override for that path.
        auto_union_fields.forEach(({ path }) => {
            if (hidden.includes(path) || path in field_overrides) {
                return;
            }
            const field_schema = get_nested_schema_key(path);
            if (field_schema) {
                set_nested_modified_field(
                    path,
                    field_schema.check(fieldConfig({ fieldType: union_field_type(path) }))
                );
            } else {
                console.warn(`Union field for ${path} could not be applied because the field does not exist in the schema.`);
            }
        });

        // render color-marked fields with a picker, unless hidden or overridden.
        auto_color_fields.forEach(({ path }) => {
            if (hidden.includes(path) || path in field_overrides) {
                return;
            }
            const field_schema = get_nested_schema_key(path);
            if (field_schema) {
                set_nested_modified_field(
                    path,
                    field_schema.check(fieldConfig({ fieldType: color_field_type(path) }))
                );
            } else {
                console.warn(`Color field for ${path} could not be applied because the field does not exist in the schema.`);
            }
        });

        console.log("Modified fields", modified_fields);
        return schema.safeExtend(modified_fields);
    }, [schema, const_fields, extraHiddenFields, visibleConstFields, field_overrides, large_text_fields, auto_union_fields, auto_color_fields, get_nested_schema_key]);

    console.log("Filtered schema", filtered_schema);

    const schema_provider = useMemo(
        () => new ZodProvider(filtered_schema),
        [filtered_schema]
    );

    // component-raised statuses, keyed by field path. errors block submit; warnings
    // must be confirmed. reporters use functional updates so their identity is
    // stable (components call them from effects without triggering render loops).
    const [component_errors, set_component_errors] = useState<Record<string, string>>({});
    const [component_warnings, set_component_warnings] = useState<Record<string, string>>({});
    const [pending_data, set_pending_data] = useState<any | null>(null);

    const update_status = (
        setter: React.Dispatch<React.SetStateAction<Record<string, string>>>,
        path: string,
        message: string | null
    ) => {
        setter((prev) => {
            if (!message) {
                if (!(path in prev)) return prev;
                const next = { ...prev };
                delete next[path];
                return next;
            }
            if (prev[path] === message) return prev;
            return { ...prev, [path]: message };
        });
    };

    const report_error = useCallback(
        (path: string, message: string | null) => update_status(set_component_errors, path, message),
        []
    );
    const report_warning = useCallback(
        (path: string, message: string | null) => update_status(set_component_warnings, path, message),
        []
    );
    const status_api = useMemo(() => ({ report_error, report_warning }), [report_error, report_warning]);

    const error_messages = Object.values(component_errors);
    const warning_messages = Object.values(component_warnings);

    // clear a stale pending confirmation once the warnings that prompted it are gone
    useEffect(() => {
        if (pending_data && warning_messages.length === 0) {
            set_pending_data(null);
        }
    }, [pending_data, warning_messages.length]);

    const do_submit = useCallback(
        (data: any) => {
            // enforce const fields
            onSubmit({ ...data, ...const_fields });
        },
        [const_fields, onSubmit]
    );

    // read statuses through a ref so handle_submit stays referentially stable —
    // otherwise it changes whenever a warning/error does, which re-renders (and
    // thus remounts) the whole AutoForm subtree.
    const status_state_ref = useRef({ errors: component_errors, warnings: component_warnings });
    status_state_ref.current = { errors: component_errors, warnings: component_warnings };

    const handle_submit = useCallback(
        (data: any) => {
            // component-raised errors block submission entirely
            if (Object.keys(status_state_ref.current.errors).length > 0) {
                return;
            }
            // warnings require an explicit confirmation step
            if (Object.keys(status_state_ref.current.warnings).length > 0) {
                set_pending_data(data);
                return;
            }
            do_submit(data);
        },
        [do_submit]
    );

    const custom_form_components = useMemo(() => {
        const components: Record<string, React.ComponentType<any>> = {};
        Object.entries(field_overrides).forEach(([key, component]) => {
            components[`custom-${key}`] = wrap_field_override(component);
        });
        // generic union renderer, bound to each detected union's branch schemas
        auto_union_fields.forEach(({ path, options }) => {
            if (path in field_overrides) return;
            const Bound = (props: FieldOverrideProps<any>) => <UnionField {...props} options={options} />;
            components[union_field_type(path)] = wrap_field_override(Bound);
        });
        // color picker, bound to each detected color field's format
        auto_color_fields.forEach(({ path, format }) => {
            if (path in field_overrides) return;
            const Bound = (props: FieldOverrideProps<any>) => <ControlledColor {...props} format={format} />;
            components[color_field_type(path)] = wrap_field_override(Bound);
        });
        return components;
    }, [field_overrides, auto_union_fields, auto_color_fields]);
    console.log("Custom form components", custom_form_components);

    // loading an existing json file seeds the form's default values. AutoForm only
    // reads defaultValues on mount, so bump reload_nonce to remount it with them.
    const [loaded_values, set_loaded_values] = useState<Record<string, any> | null>(null);
    const [reload_nonce, set_reload_nonce] = useState(0);
    const file_input_ref = useRef<HTMLInputElement>(null);

    const handle_load_file = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // allow re-selecting the same file
        if (!file) return;
        file.text()
            .then((text) => {
                const parsed = JSON.parse(text);
                if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                    throw new Error("Expected a JSON object");
                }
                set_loaded_values(parsed);
                set_reload_nonce((n) => n + 1);
            })
            .catch((err) => {
                console.error("Failed to load JSON", err);
                alert(`Could not load file: ${err.message}`);
            });
    }, []);

    const form_components = useMemo(
        () => ({
            select: ControlledSelect,
            number: ControlledNumber,
            boolean: ControlledCheckbox,
            textarea: ControlledTextarea,
            hidden: HIDDEN_COMPONENT,
            ...custom_form_components
        }),
        [custom_form_components]
    );

    const merged_default_values = useMemo(
        () => ({ ...defaultValues, ...(loaded_values ?? {}), ...const_fields }),
        [defaultValues, loaded_values, const_fields]
    );

    // memoize the AutoForm element so SchemaForm re-renders (from warning/error
    // state) don't re-render it. AutoForm re-rendering recreates its inline inner
    // component and remounts the whole form, which re-fires field effects and loops.
    const auto_form = useMemo(
        () => (
            <AutoForm
                key={reload_nonce}
                schema={schema_provider}
                onSubmit={handle_submit}
                defaultValues={merged_default_values}
                withSubmit
                formComponents={form_components}
            />
        ),
        [reload_nonce, schema_provider, handle_submit, merged_default_values, form_components]
    );

    return (
        <MantineProvider>
            <main style={{ margin: "2rem" }}>
                <Group justify="space-between" align="center" mb="md">
                    <Title order={2}>{title}</Title>

                    <input
                        ref={file_input_ref}
                        type="file"
                        accept="application/json,.json"
                        style={{ display: "none" }}
                        onChange={handle_load_file}
                    />
                    <Button
                        type="button"
                        variant="light"
                        onClick={() => file_input_ref.current?.click()}
                    >
                        Load existing JSON
                    </Button>
                </Group>

                <FieldStatusContext.Provider value={status_api}>
                    {auto_form}
                </FieldStatusContext.Provider>

                {error_messages.length > 0 && (
                    <Alert color="red" title="Cannot submit" mt="md">
                        <Stack gap={4}>
                            {error_messages.map((m, i) => (
                                <Text key={i} size="sm">{m}</Text>
                            ))}
                        </Stack>
                    </Alert>
                )}

                <Modal
                    opened={pending_data !== null}
                    onClose={() => set_pending_data(null)}
                    title="Please confirm before submitting"
                    centered
                    // blocking: no click-outside/escape dismissal, so the form can't be
                    // edited underneath while the captured data is awaiting confirmation
                    closeOnClickOutside={false}
                    closeOnEscape={false}
                    withCloseButton={false}
                >
                    <Stack gap="md">
                        <Stack gap={4}>
                            {warning_messages.map((m, i) => (
                                <Text key={i} size="sm">{m}</Text>
                            ))}
                        </Stack>
                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => set_pending_data(null)}>
                                Cancel
                            </Button>
                            <Button
                                color="yellow"
                                onClick={() => {
                                    const data = pending_data;
                                    set_pending_data(null);
                                    do_submit(data);
                                }}
                            >
                                Submit anyway
                            </Button>
                        </Group>
                    </Stack>
                </Modal>
            </main>
        </MantineProvider>
    );
};
