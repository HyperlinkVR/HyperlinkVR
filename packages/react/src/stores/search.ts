import { get_slug_by_url, get_world_by_slug, init_search, init_slugs, search_worlds, slug_prefix_search } from "@hyperlinkvr/search-client";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";

import { useServiceURLs } from "../hooks";


interface SearchState {
    is_slug_loading: boolean;
    is_slug_loaded: boolean;
    is_search_loading: boolean;
    is_search_loaded: boolean;

    preload_slugs: (search_index: string) => Promise<void>;
    preload_search: (search_index: string) => Promise<void>;
    search: (search_index: string, query: string, options?: any) => Promise<any[]>;
    slug_prefix_search: (search_index: string, query: string) => Promise<any[]>;

    get_world_by_slug: (search_index: string, slug: string) => Promise<any | null>;
    get_slug_by_url: (search_index: string, url: string) => Promise<string | null>;
}

// TODO: type search response

export const useSearchStore = create<SearchState>((set, get) => ({
    is_slug_loading: false,
    is_slug_loaded: false,
    is_search_loading: false,
    is_search_loaded: false,

    preload_slugs: async (search_index: string) => {
        if (get().is_slug_loaded || get().is_slug_loading) return;
        set({ is_slug_loading: true });
        try {
            await init_slugs(search_index);
            set({ is_slug_loaded: true, is_slug_loading: false });
        } catch (err) {
            console.error("Failed to load slug mapping:", err);
            set({ is_slug_loading: false });
        }
    },

    preload_search: async (search_index: string) => {
        if (get().is_search_loaded || get().is_search_loading) return;
        set({ is_search_loading: true });
        try {
            await init_search(search_index);
            set({
                is_slug_loaded: true,
                is_search_loaded: true,
                is_search_loading: false
            });
        } catch (err) {
            console.error("Failed to load search index:", err);
            set({ is_search_loading: false });
        }
    },

    search: async (search_index: string, query: string, options) => {
        if (!get().is_search_loaded) {
            await get().preload_search(search_index);
        }
        return search_worlds(query, options);
    },

    slug_prefix_search: async (search_index: string, query: string) => {
        if (!get().is_slug_loaded) {
            await get().preload_slugs(search_index);
        }
        return slug_prefix_search(query);
    },

    get_world_by_slug: async (search_index: string, slug: string) => {
        if (!get().is_slug_loaded) {
            await get().preload_slugs(search_index);
        }
        return get_world_by_slug(slug);
    },

    get_slug_by_url: async (search_index: string, url: string) => {
        if (!get().is_slug_loaded) {
            await get().preload_slugs(search_index);
        }
        return get_slug_by_url(url);
    }
}));

// using the below hooks is technically less efficient than using the store directly as loading state will cause re-renders,
// but in practice is likely to be desired anyway, a component can still use the store if it truly doesn't care about loading state and wants to avoid re-renders

export const useFuzzySearch = () => {
    const { search: search_url } = useServiceURLs();

    const store_preload_search = useSearchStore((state) => state.preload_search);
    const store_search = useSearchStore((state) => state.search);

    const preload_search = useCallback(
        async () => {
            if (!search_url) return;
            await store_preload_search(search_url);
        },
        [search_url, store_preload_search]
    );

    const search = useCallback(
        async (query: string, options?: any) => {
            if (!search) return [];
            return await store_search(search_url, query, options);
        },
        [search_url, store_search]
    );

    return { preload_search, search };
}

export const useSlugLookup = () => {
    const { search: search_url } = useServiceURLs();

    const store_preload_slugs = useSearchStore((state) => state.preload_slugs);
    const store_get_slug_by_url = useSearchStore((state) => state.get_slug_by_url);
    const store_get_world_by_slug = useSearchStore((state) => state.get_world_by_slug);
    const store_slug_prefix_search = useSearchStore((state) => state.slug_prefix_search);

    const preload_slugs = useCallback(
        async () => {
            if (!search_url) return;
            await store_preload_slugs(search_url);
        },
        [search_url, store_preload_slugs]
    );

    const get_slug_by_url = useCallback(
        async (url: string) => {
            if (!search_url) return null;
            return await store_get_slug_by_url(search_url, url);
        },
        [search_url, store_get_slug_by_url]
    );

    const get_world_by_slug = useCallback(
        async (slug: string) => {
            if (!search_url) return null;
            return await store_get_world_by_slug(search_url, slug);
        },
        [search_url, store_get_world_by_slug]
    );

    const slug_prefix_search = useCallback(
        async (query: string) => {
            if (!search_url) return [];
            return await store_slug_prefix_search(search_url, query);
        },
        [search_url, store_slug_prefix_search]
    );

    return { preload_slugs, get_slug_by_url, get_world_by_slug, slug_prefix_search };
}

export const useSlugByURL = (url?: string) => {
    const { get_slug_by_url } = useSlugLookup();

    const [slug, setSlug] = useState<string | null>(null);

    useEffect(() => {
        if (!url) {
            setSlug(null);
            return;
        }

        let cancelled = false;
        (async () => {
            const result = await get_slug_by_url(url);
            if (!cancelled) {
                setSlug(result);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [url, get_slug_by_url]);

    return slug;
}

export const useWorldBySlug = (slug?: string) => {
    const { get_world_by_slug } = useSlugLookup();

    const [world, setWorld] = useState<any | null>(null);

    useEffect(() => {
        if (!slug) {
            setWorld(null);
            return;
        }

        let cancelled = false;
        (async () => {
            const result = await get_world_by_slug(slug);
            if (!cancelled) {
                setWorld(result);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [slug, get_world_by_slug]);

    return world;
}
