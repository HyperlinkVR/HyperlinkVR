import { useSetting, useWorldSession } from "@hyperlinkvr/react";
import type { AssetRef } from "@hyperlinkvr/vr-engine-schemas";
import { is_asset_ref } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useMemo, useState } from "react";



import { fetch_asset } from "../security/fetch_asset";


// TODO: cache resulting blobs keyed by source url, they can use standard cache busting to bypass it

// it doesn't matter here if we get tricked by a domain name pointing at localhost, they're just scamming themself out of access to localhost
// the same is not true for the other direction, url inspection is not sufficient to determine if a resource comes from loopback
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

export const useAssetURL = (ref: AssetRef | string | undefined): string | null | undefined => {
    const [allow_local_anywhere, _, allow_local_anywhere_setting_loaded] = useSetting("devtools_dangerously_allow_localhost_fetch");
    const {url} = useWorldSession();

    const allow_local = useMemo(() => allow_local_anywhere || (url ? world_url_is_local(url) : false), [allow_local_anywhere, url]);

    const [object_url, setObjectURL] = useState<string | null | undefined>(undefined);

    const source_url = useMemo(() => {
        if (!ref) {
            return null;
        }

       if (!is_asset_ref(ref)) {
           console.warn(`useAssetURL was passed a direct URL (${ref}). This strongly suggests that assets are being mishandled. Pass an AssetRef. Interpreting as URL regardless.`);
           return ref;
       } else {
           // this is the only place this is allowed to be used!!!! don't use it anywhere else!!!
           return ref.dangerously_get_source_url();
       }
    }, [ref]);

    useEffect(() => {
        if (!source_url || !allow_local_anywhere_setting_loaded) {
            setObjectURL(undefined);
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
            setObjectURL(undefined);

            if (blob_url) {
                URL.revokeObjectURL(blob_url);
            }
        };
    }, [source_url, allow_local, allow_local_anywhere_setting_loaded]);

    return object_url;
};

export const useAssetURLArray = (
    refs: (AssetRef | string | undefined)[]
): (string | null | undefined)[] => {
    const [allow_local_anywhere, _, allow_local_anywhere_setting_loaded] = useSetting("devtools_dangerously_allow_localhost_fetch");
    const { url } = useWorldSession();

    const allow_local = useMemo(
        () => allow_local_anywhere || (url ? world_url_is_local(url) : false),
        [allow_local_anywhere, url]
    );

    const [object_urls, setObjectUrls] = useState<
        (string | null | undefined)[]
    >(refs.map(() => undefined));

    const source_urls = useMemo(() => {
        return refs.map((ref) => {
            if (!ref) return null;
            if (!is_asset_ref(ref)) {
                console.warn(
                    `useAssetURLArray was passed a direct URL (${ref}). Pass an AssetRef.`
                );
                return ref as string;
            }
            return ref.dangerously_get_source_url();
        });
    }, [refs]);

    useEffect(() => {
        if (!allow_local_anywhere_setting_loaded) {
            setObjectUrls(source_urls.map(() => undefined));
            return;
        }

        let cancelled = false;
        const blob_urls: (string | null)[] = new Array(source_urls.length).fill(
            null
        );

        setObjectUrls(source_urls.map(() => undefined));

        source_urls.forEach((source_url, index) => {
            if (!source_url) {
                setObjectUrls((prev) => {
                    const next = [...prev];
                    next[index] = null;
                    return next;
                });
                return;
            }

            fetch_asset(source_url, allow_local)
                .then((blob) => {
                    if (cancelled) return;
                    const blob_url = URL.createObjectURL(blob);
                    blob_urls[index] = blob_url;

                    setObjectUrls((prev) => {
                        const next = [...prev];
                        next[index] = blob_url;
                        return next;
                    });
                })
                .catch((error) => {
                    console.warn(`Asset failed: ${source_url}`, error);
                    if (!cancelled) {
                        setObjectUrls((prev) => {
                            const next = [...prev];
                            next[index] = null;
                            return next;
                        });
                    }
                });
        });

        return () => {
            cancelled = true;
            blob_urls.forEach((url) => {
                if (url) URL.revokeObjectURL(url);
            });
        };
    }, [
        source_urls.join(","),
        allow_local,
        allow_local_anywhere_setting_loaded
    ]);

    return object_urls;
};

// TODO: unite logic

// TODO: the sdk should know when the asset loading is blocked for mesh, interaction, collider etc so it can decide whether to continue
