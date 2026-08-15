import {useEffect, useMemo, useState} from "react";
import type { AssetRef } from "@hyperlinkvr/vr-engine-schemas";
import {useSetting, useTabSession} from "@hyperlinkvr/react";
import {fetch_asset} from "../security/fetch_asset";

// TODO: cache resulting blobs keyed by source url, they can use standard cache busting to bypass it

const world_url_is_local = (world_url: string): boolean => {
    try {
        const hostname = new URL(world_url).hostname.toLowerCase().replace(/\.$/, "");

        return (
            hostname === "localhost" ||
            hostname.endsWith(".localhost") ||
            hostname === "::1" ||
            hostname === "[::1]" ||
            /^127\./.test(hostname)
        );
    } catch {
        return false;
    }
};

export const useAssetURL = (ref: AssetRef | undefined): string | null => {
    const [allow_local_anywhere] = useSetting("devtools_dangerously_allow_localhost_fetch");
    const {url} = useTabSession();

    const allow_local = useMemo(() => allow_local_anywhere || (url ? world_url_is_local(url) : false), [allow_local_anywhere, url]);

    const [object_url, setObjectURL] = useState<string | null>(null);

    // the only place this should be called!!!
    const source_url = ref?.dangerously_get_source_url();

    useEffect(() => {
        if (!source_url) {
            setObjectURL(null);
            return;
        }

        let cancelled = false;
        let blob_url: string | null = null;

        fetch_asset(source_url, allow_local)
            .then((blob) => {
                if (cancelled) {
                    return;
                }

                blob_url = URL.createObjectURL(blob);
                setObjectURL(blob_url);
            })
            .catch((error: any) => {
                console.warn(`Asset failed: ${source_url}`, error);

                if (!cancelled) {
                    setObjectURL(null);
                }
            });

        return () => {
            cancelled = true;
            setObjectURL(null);

            if (blob_url) {
                URL.revokeObjectURL(blob_url);
            }
        };
    }, [source_url, allow_local]);

    return object_url;
};
