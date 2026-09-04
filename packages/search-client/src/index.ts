import MiniSearch from "minisearch";


let base_url = "";
let cached_manifest: any = null;
let search_index: MiniSearch | null = null;
let by_slug_map: Record<string, any> = {};
let by_url_map = new Map<string, string>();

let is_slugs_loaded = false;
let is_search_loaded = false;

// TODO: type search replies

export const configure_search = (config: { base_url: string }): void => {
    base_url = config.base_url.replace(/\/$/, "");
};

const get_base_url = (): string => {
    if (!base_url) {
        throw new Error(
            "base_url is not configured"
        );
    }
    return base_url;
};

const from_base = (base: string, path: string, query?: Record<string, string>): string => {
    const url = new URL(path, base);
    if (query) {
        Object.entries(query).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
    }
    return url.toString();
};

const get_manifest = async (override_base?: string): Promise<any> => {
    if (cached_manifest) return cached_manifest;
    const base = override_base || get_base_url();
    cached_manifest = await fetch(from_base(base, "manifest.json")).then((r) =>
        r.json()
    );
    return cached_manifest;
};

// TODO: short ttl on manifest to check for updates, need to reinit indices when it changes too

export const init_slugs = async (override_base?: string): Promise<void> => {
    if (override_base) configure_search({ base_url: override_base });
    if (is_slugs_loaded) return;

    const base = get_base_url();
    const manifest = await get_manifest(base);
    const version = encodeURIComponent(manifest.built_at);

    const slug_data = await fetch(from_base(base, "by-slug.json", {v: version})).then((r) =>
        r.json()
    );
    by_slug_map = slug_data;
    by_url_map = new Map(
        Object.values(slug_data).map((w: any) => [w.url, w.slug])
    );
    is_slugs_loaded = true;
};

export const init_search = async (override_base?: string): Promise<void> => {
    if (override_base) configure_search({ base_url: override_base });
    if (is_search_loaded) return;

    await init_slugs(override_base);

    const base = get_base_url();
    const manifest = await get_manifest(base);
    const version = encodeURIComponent(manifest.built_at);

    const json = await fetch(from_base(base, "search-index.json", {v: version})).then(
        (r) => r.text()
    );
    search_index = MiniSearch.loadJSON(json, manifest.minisearch);
    is_search_loaded = true;
};

export const search_worlds = (query: string, options?: any) => {
    if (!search_index || !query.trim()) return [];
    return search_index.search(query, options);
};

export const get_world_by_slug = (slug: string) => {
    if (!slug) return null;
    return by_slug_map[slug] ?? null;
};

export const get_slug_by_url = (url: string) => {
    if (!url) return null;
    const normalized = url.replace(/\/$/, "");
    return by_url_map.get(normalized) ?? by_url_map.get(url) ?? null;
};
