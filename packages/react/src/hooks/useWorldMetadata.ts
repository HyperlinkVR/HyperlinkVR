import {
    WorldMetadata,
    WorldMetadataInput,
    WorldMetadataSchema
} from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useMemo, useState } from "react";





const metadata_candidates = (world_url: string): string[] => {
    const base = new URL(world_url);
    const last = base.pathname.split("/").pop() ?? "";
    const looks_like_file = last.includes(".");

    // as-directory: append under the URL
    const as_dir = new URL(base);
    if (!as_dir.pathname.endsWith("/")) as_dir.pathname += "/";

    const child = new URL("hvr-world.json", as_dir).toString();
    // as-file: sibling of the URL
    const sibling = new URL("hvr-world.json", base).toString();

    // hint decides order, but still include both in case of weird urls (e.g. a directory containing a dot in its name)
    const ordered = looks_like_file ? [sibling, child] : [child, sibling];
    return [...new Set(ordered)];
}

export const useWorldMetadata = (world_url: string | null) => {
    const [world_metadata, setWorldMetadata] = useState<WorldMetadata | null>(null);
    const candidates = useMemo(() => {
        if (!world_url) return [];

        try {
            return metadata_candidates(world_url);
        } catch (error) {
            console.error("Invalid world URL:", world_url, error);
            return [];
        }
    }, [world_url]);

    useEffect(() => {
        if (candidates.length === 0) {
            setWorldMetadata(null);
            return;
        }

        let cancelled = false;
        const controller = new AbortController();

        (async () => {
            for (const url of candidates) {
                try {
                    const response = await fetch(url, { signal: controller.signal });
                    if (!response.ok) continue; // try next candidate

                    const input_data = await response.json();
                    const { data, success } = WorldMetadataSchema.safeParse(input_data);
                    if (!success) {
                        console.error("Invalid world metadata:", input_data);
                        continue; // a malformed file shouldn't block the fallback candidate
                    }

                    if (!cancelled) setWorldMetadata(data);
                    return; // first good hit wins
                } catch (error) {
                    if (controller.signal.aborted) return; // unmounted / url changed
                    console.error("Error fetching world metadata:", error);
                    // network error on one candidate, fall through to the next
                }
            }

            if (!cancelled) setWorldMetadata(null); // nothing resolved
        })();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [candidates]);


    return world_metadata;
};


const WORLD_METADATA_FALLBACK_DEFAULT = WorldMetadataSchema.parse({
    version: 1,
    title: "Unknown World",
} satisfies WorldMetadataInput);

export const useWorldMetadataWithFallback = (world_url: string | null, fallback: WorldMetadata = WORLD_METADATA_FALLBACK_DEFAULT) => {
    const world_metadata = useWorldMetadata(world_url);

    if (world_metadata) {
        return world_metadata;
    }

    return fallback;
};
