import { z } from "zod";

// zod wrappers (optional/nullable/default/readonly) hide the inner type behind
// `.def.innerType`. peel them so we can inspect/traverse the underlying schema.
export const unwrap_schema = (schema: any): any => {
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

// find a union inside wrappers / transform pipes and return its option schemas,
// or null if the schema isn't (ultimately) a union. `.transform()` produces a
// pipe whose `in` side holds the real schema, so we follow that too.
export const get_union_options = (schema: any): any[] | null => {
    let current = unwrap_schema(schema);
    while (current && current.def && current.def.type === "pipe") {
        current = unwrap_schema(current.def.in);
    }
    if (current && current.def && current.def.type === "union") {
        return current.def.options as any[];
    }
    return null;
};

// true if the schema is optional anywhere in its wrapper stack.
export const is_optional_schema = (schema: any): boolean => {
    if (!schema?.def) return false;
    if (schema.def.type === "optional") return true;
    if ("innerType" in schema.def) return is_optional_schema(schema.def.innerType);
    return false;
};

// the default value declared via `.default()`, if any, walking wrappers.
export const get_default_value = (schema: any): any => {
    if (!schema?.def) return undefined;
    if (schema.def.type === "default") return schema.def.defaultValue;
    if ("innerType" in schema.def) return get_default_value(schema.def.innerType);
    return undefined;
};

// if a field is marked with `.meta({ widget: "color" })`, return its declared
// color_format ("number" | "string"), else null. walks wrappers and transform
// pipes since the marker may sit under an optional/pipe stack.
export const get_color_format = (schema: any): "number" | "string" | null => {
    let current = schema;
    const seen = new Set<any>();
    while (current && !seen.has(current)) {
        seen.add(current);
        const meta = z.globalRegistry.get(current) as any;
        if (meta?.widget === "color") {
            return meta.color_format === "number" ? "number" : "string";
        }
        const def = current.def;
        if (!def) break;
        if ("innerType" in def) current = def.innerType;
        else if (def.type === "pipe") current = def.in;
        else break;
    }
    return null;
};
