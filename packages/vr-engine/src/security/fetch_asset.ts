declare global {
    interface RequestInit {
        // chrome and some firefox versions support this. it's best effort. see asset_ref.ts for my rant on why this is all we can reasonably do to prevent local network access
        targetAddressSpace?: "public" | "local" | "loopback";
    }
}

const FETCH_TIMEOUT_MS = 30_000;

export const fetch_asset = async (
    source_url: string,
    allow_local: boolean
): Promise<Blob> => {
    const parsed = new URL(source_url);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`Asset scheme ${parsed.protocol} is not permitted.`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(source_url, {
            method: "GET",
            mode: "cors",
            // never send cookies
            credentials: "omit",
            redirect: "follow",
            signal: controller.signal,
            targetAddressSpace: allow_local ? undefined : "public"
        });

        if (!response.ok) {
            throw new Error(`Asset server returned ${response.status}.`);
        }

        // straight into the blob store, so the bytes arent pulled into memory needlessly
        return await response.blob();
    } finally {
        clearTimeout(timeout);
    }
};
