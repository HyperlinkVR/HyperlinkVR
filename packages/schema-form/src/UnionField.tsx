import {
    Button,
    Checkbox,
    Group,
    NumberInput,
    Paper,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput
} from "@mantine/core";
import { useMemo } from "react";

import {
    get_default_value,
    is_optional_schema,
    unwrap_schema
} from "./schema_utils";
import { type FieldOverrideProps } from "./SimpleField";

type FieldKind = "string" | "number" | "boolean" | "enum" | "literal" | "other";

interface FieldDesc {
    key: string;
    kind: FieldKind;
    optional: boolean;
    enum_options?: string[];
    default?: any;
    value?: any;
}

interface BranchDesc {
    label: string;
    kind:
        | "object"
        | "array"
        | "literal"
        | "string"
        | "number"
        | "boolean"
        | "other";
    schema: any;
    fields?: FieldDesc[];
    value?: any;
}

// zod v4 stores a literal's value(s) in `def.values` (always an array, e.g.
// z.literal("any") -> ["any"]); older shapes used the scalar `def.value`. reading
// `def.value ?? def.values` would surface the whole array as the value, which
// then reads back as an array branch. collapse to the single scalar here.
const literal_value = (def: any): any => {
    if (Array.isArray(def?.values)) return def.values[0];
    return def?.value;
};

const kind_of = (schema: any): FieldKind => {
    const base = unwrap_schema(schema);
    const type =
        base?.def?.type ??
        base?._def?.typeName?.replace("Zod", "").toLowerCase();

    if (type === "string") return "string";
    if (type === "number") return "number";
    if (type === "boolean") return "boolean";
    if (type === "enum") return "enum";
    if (type === "literal") return "literal";
    return "other";
};

const describe_field = (key: string, schema: any): FieldDesc => {
    const base = unwrap_schema(schema);
    const def = base?.def ?? base?._def ?? {};
    const kind = kind_of(schema);

    return {
        key,
        kind,
        optional: is_optional_schema(schema),
        enum_options:
            kind === "enum"
                ? Object.keys(def.entries ?? def.values ?? {})
                : undefined,
        value: kind === "literal" ? literal_value(def) : undefined,
        default: get_default_value(schema)
    };
};

const describe_branch = (option: any): BranchDesc => {
    // Determine raw wrapper before unwrapping to avoid stripping array containers
    const raw_def = option?.def ?? option?._def ?? {};
    const raw_type =
        raw_def.type ?? raw_def.typeName?.replace("Zod", "").toLowerCase();

    if (raw_type === "array") {
        return {
            kind: "array",
            label: "List",
            schema: option
        };
    }

    const base = unwrap_schema(option);
    const def = base?.def ?? base?._def ?? {};
    const type = def.type ?? def.typeName?.replace("Zod", "").toLowerCase();

    if (type === "object") {
        const shape =
            def.shape ?? (typeof def.shape === "function" ? def.shape() : {});
        return {
            kind: "object",
            label: "Details",
            schema: option,
            fields: Object.entries(shape).map(([k, v]) => describe_field(k, v))
        };
    }

    if (type === "literal") {
        const val = literal_value(def);
        return {
            kind: "literal",
            label: val !== undefined ? String(val) : "Literal",
            value: val,
            schema: option
        };
    }

    if (type === "string")
        return { kind: "string", label: "Text", schema: option };
    if (type === "number")
        return { kind: "number", label: "Number", schema: option };
    if (type === "boolean")
        return { kind: "boolean", label: "Toggle", schema: option };

    return { kind: "other", label: type ?? "Value", schema: option };
};

const branch_init = (branch: BranchDesc): any => {
    if (branch.kind === "literal") return branch.value;
    if (branch.kind === "array") return [];
    if (branch.kind !== "object")
        return branch.kind === "string" ? "" : undefined;

    const obj: Record<string, any> = {};
    branch.fields?.forEach((f) => {
        if (f.kind === "literal") obj[f.key] = f.value;
        else if (f.default !== undefined) obj[f.key] = f.default;
    });
    return obj;
};

const branch_for_value = (branches: BranchDesc[], value: any): number => {
    // 1. Array check takes precedence over standard object checks
    if (Array.isArray(value)) {
        const i = branches.findIndex((b) => b.kind === "array");
        if (i >= 0) return i;
    }

    // 2. Exact match for literals
    const literal_index = branches.findIndex(
        (b) => b.kind === "literal" && b.value === value
    );
    if (literal_index >= 0) return literal_index;

    // 3. Primitive matches
    if (typeof value === "string") {
        const i = branches.findIndex((b) => b.kind === "string");
        if (i >= 0) return i;
    }
    if (typeof value === "number") {
        const i = branches.findIndex((b) => b.kind === "number");
        if (i >= 0) return i;
    }
    if (typeof value === "boolean") {
        const i = branches.findIndex((b) => b.kind === "boolean");
        if (i >= 0) return i;
    }

    // 4. Fall back to object branch
    const object_index = branches.findIndex((b) => b.kind === "object");
    return object_index >= 0 ? object_index : 0;
};

// renders the editor for a single resolved branch. autoform doesn't expose its
// field renderer, so every branch kind is instanced by hand here; the array kind
// recurses into this same component for each element.
const BranchBody = ({
    branch,
    value,
    set_value
}: {
    branch: BranchDesc;
    value: any;
    set_value: (v: any) => void;
}) => {
    if (branch.kind === "object") {
        const obj =
            value && typeof value === "object" && !Array.isArray(value)
                ? value
                : {};
        const set_field = (key: string, v: any) =>
            set_value({ ...obj, [key]: v });

        return (
            <>
                {branch.fields!.map((f) => {
                    const field_label = f.optional ? f.key : `${f.key} *`;
                    if (f.kind === "boolean") {
                        return (
                            <Checkbox
                                key={f.key}
                                label={field_label}
                                checked={!!obj[f.key]}
                                onChange={(e) =>
                                    set_field(f.key, e.currentTarget.checked)
                                }
                            />
                        );
                    }
                    if (f.kind === "number") {
                        return (
                            <NumberInput
                                key={f.key}
                                label={field_label}
                                value={obj[f.key] ?? ""}
                                onChange={(v) =>
                                    set_field(
                                        f.key,
                                        v === "" ? undefined : Number(v)
                                    )
                                }
                            />
                        );
                    }
                    if (f.kind === "enum") {
                        return (
                            <Select
                                key={f.key}
                                label={field_label}
                                data={f.enum_options ?? []}
                                value={obj[f.key] ?? null}
                                onChange={(v) =>
                                    set_field(f.key, v ?? undefined)
                                }
                            />
                        );
                    }
                    if (f.kind === "literal") {
                        return (
                            <TextInput
                                key={f.key}
                                label={field_label}
                                value={String(f.value ?? "")}
                                disabled
                            />
                        );
                    }
                    return (
                        <TextInput
                            key={f.key}
                            label={field_label}
                            value={obj[f.key] ?? ""}
                            onChange={(e) =>
                                set_field(f.key, e.currentTarget.value)
                            }
                        />
                    );
                })}
            </>
        );
    }

    if (branch.kind === "array") {
        const items: any[] = Array.isArray(value) ? value : [];
        // the array branch keeps its raw (possibly wrapped) schema; unwrap to reach
        // the element schema, then describe it as its own branch so each item can be
        // rendered by recursing into this component.
        const element_schema = unwrap_schema(branch.schema)?.element;
        const element_branch = element_schema
            ? describe_branch(element_schema)
            : null;

        const update_item = (i: number, v: any) => {
            const next = items.slice();
            next[i] = v;
            set_value(next);
        };
        const remove_item = (i: number) =>
            set_value(items.filter((_, idx) => idx !== i));
        const add_item = () =>
            set_value([
                ...items,
                element_branch ? branch_init(element_branch) : undefined
            ]);

        return (
            <Stack gap="xs">
                {items.map((item, i) => (
                    <Paper key={i} withBorder p="xs">
                        <Group justify="space-between" mb="xs">
                            <Text size="xs" c="dimmed">
                                #{i + 1}
                            </Text>
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                onClick={() => remove_item(i)}
                            >
                                Remove
                            </Button>
                        </Group>
                        {element_branch && (
                            <Stack gap="xs">
                                <BranchBody
                                    branch={element_branch}
                                    value={item}
                                    set_value={(v) => update_item(i, v)}
                                />
                            </Stack>
                        )}
                    </Paper>
                ))}
                <Button size="xs" variant="light" onClick={add_item}>
                    Add item
                </Button>
            </Stack>
        );
    }

    if (branch.kind === "literal") {
        return (
            <TextInput value={String(branch.value ?? "")} disabled readOnly />
        );
    }

    if (branch.kind === "string") {
        return (
            <TextInput
                value={typeof value === "string" ? value : ""}
                onChange={(e) => set_value(e.currentTarget.value)}
            />
        );
    }

    if (branch.kind === "number") {
        return (
            <NumberInput
                value={typeof value === "number" ? value : ""}
                onChange={(v) => set_value(v === "" ? undefined : Number(v))}
            />
        );
    }

    if (branch.kind === "boolean") {
        return (
            <Checkbox
                checked={!!value}
                onChange={(e) => set_value(e.currentTarget.checked)}
            />
        );
    }

    return null;
};

export const UnionField = ({
    value,
    set_value,
    label,
    error,
    options
}: FieldOverrideProps & { options: any[]; field?: any }) => {
    const branches = useMemo(() => options.map(describe_branch), [options]);
    const active = branch_for_value(branches, value);
    const branch = branches[active]!;

    return (
        <Stack gap="xs">
            {label && <Text fw={500}>{label}</Text>}

            {branches.length > 1 && (
                <SegmentedControl
                    size="xs"
                    value={String(active)}
                    onChange={(v) =>
                        set_value(branch_init(branches[Number(v)]!))
                    }
                    data={branches.map((b, i) => ({
                        label: b.label,
                        value: String(i)
                    }))}
                />
            )}

            <BranchBody branch={branch} value={value} set_value={set_value} />

            {error && (
                <Text c="red" size="sm">
                    {error}
                </Text>
            )}
        </Stack>
    );
};
