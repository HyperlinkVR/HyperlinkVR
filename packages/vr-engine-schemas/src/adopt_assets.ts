import type { z } from "zod";

import { AssetRef } from "./assets";

// walks the schema and replaces any asset urls with assetrefs

type AnySchema = z.ZodType<any, any>;

export type Adopted<T> =
    T extends string ? string | AssetRef :
        T extends (infer Item)[] ? Adopted<Item>[] :
            T extends object ? { [K in keyof T]: Adopted<T[K]> } :
                T;

const get_def = (schema: any): any => schema?._zod?.def ?? schema?.def;

const is_asset_leaf = (schema: any): boolean =>
    schema?.meta?.()?.IS_ASSET_URL === true;

function* child_schemas(schema: any): Generator<any> {
    const def = get_def(schema);

    if (!def) {
        return;
    }

    switch (def.type) {
        case "optional":
        case "nullable":
        case "default":
        case "prefault":
        case "catch":
        case "readonly":
        case "nonoptional":
            yield def.innerType;
            return;
        case "lazy":
            yield def.getter();
            return;
        case "pipe":
            yield def.out;
            return;
        case "object":
        case "interface":
            for (const child of Object.values(def.shape ?? {})) {
                yield child;
            }
            return;
        case "array":
            yield def.element;
            return;
        case "union":
            for (const option of def.options ?? []) {
                yield option;
            }
            return;
        case "tuple":
            for (const item of def.items ?? []) {
                yield item;
            }
            if (def.rest) {
                yield def.rest;
            }
            return;
        case "record":
        case "map":
            if (def.keyType) {
                yield def.keyType;
            }
            if (def.valueType) {
                yield def.valueType;
            }
            return;
        case "set":
            yield def.valueType;
            return;
        case "intersection":
            yield def.left;
            yield def.right;
            return;
        default:
            return;
    }
}

const contains_asset_cache = new WeakMap<object, boolean>();
const in_progress = new Set<object>();

const schema_contains_asset = (schema: any): boolean => {
    if (!schema || typeof schema !== "object") {
        return false;
    }

    const cached = contains_asset_cache.get(schema);
    if (cached !== undefined) {
        return cached;
    }

    // recursive schemas (z.lazy) would otherwise loop forever
    if (in_progress.has(schema)) {
        return false;
    }

    in_progress.add(schema);

    let result = false;

    try {
        if (is_asset_leaf(schema)) {
            result = true;
        } else {
            for (const child of child_schemas(schema)) {
                if (schema_contains_asset(child)) {
                    result = true;
                    break;
                }
            }
        }
    } finally {
        in_progress.delete(schema);
    }

    contains_asset_cache.set(schema, result);
    return result;
};

const walk = (schema: any, value: any): any => {
    if (value === undefined || value === null) {
        return value;
    }

    if (!schema_contains_asset(schema)) {
        return value;
    }

    if (is_asset_leaf(schema)) {
        return typeof value === "string" ? new AssetRef(value) : value;
    }

    const def = get_def(schema);

    if (!def) {
        return value;
    }

    switch (def.type) {
        case "optional":
        case "nullable":
        case "default":
        case "prefault":
        case "catch":
        case "readonly":
        case "nonoptional":
            return walk(def.innerType, value);

        case "lazy":
            return walk(def.getter(), value);

        case "pipe":
            return walk(def.out, value);

        case "object":
        case "interface": {
            const shape = def.shape ?? {};
            const output: Record<string, unknown> = {};
            let changed = false;

            for (const [key, child_value] of Object.entries(value)) {
                const child_schema = (shape as Record<string, any>)[key];
                const next = child_schema ? walk(child_schema, child_value) : child_value;

                if (next !== child_value) {
                    changed = true;
                }

                output[key] = next;
            }

            return changed ? output : value;
        }

        case "array": {
            let changed = false;

            const output = (value as unknown[]).map((item) => {
                const next = walk(def.element, item);
                if (next !== item) {
                    changed = true;
                }
                return next;
            });

            return changed ? output : value;
        }

        case "union": {
            // the value already parsed, so find which branch it matched, only branches that actually contain assets are worth testing
            for (const option of def.options ?? []) {
                if (!schema_contains_asset(option)) {
                    continue;
                }

                if (option.safeParse(value).success) {
                    return walk(option, value);
                }
            }

            return value;
        }

        case "tuple": {
            const items = def.items ?? [];
            let changed = false;

            const output = (value as unknown[]).map((item, index) => {
                const item_schema = items[index] ?? def.rest;
                const next = item_schema ? walk(item_schema, item) : item;

                if (next !== item) {
                    changed = true;
                }

                return next;
            });

            return changed ? output : value;
        }

        case "record": {
            const output: Record<string, unknown> = {};
            let changed = false;

            for (const [key, child_value] of Object.entries(value)) {
                const next = def.valueType ? walk(def.valueType, child_value) : child_value;

                if (next !== child_value) {
                    changed = true;
                }

                output[key] = next;
            }

            return changed ? output : value;
        }

        default:
            return value;
    }
};

export const adopt_assets = <T>(schema: AnySchema, value: T): T =>
    schema_contains_asset(schema) ? (walk(schema, value) as T) : value;

export const parse_and_adopt = <S extends AnySchema>(
    schema: S,
    raw: unknown
): z.infer<S> =>
    adopt_assets(schema, schema.parse(raw)) as z.infer<S>;

export const safe_parse_and_adopt = <S extends AnySchema>(
    schema: S,
    raw: unknown
): {success: true; data: z.infer<S>} | {success: false; data: z.ZodError} => {
    const result = schema.safeParse(raw);

    if (!result.success) {
        return {success: false, data: result.error};
    }

    return {success: true, data: adopt_assets(schema, result.data) as z.infer<S>};
}
