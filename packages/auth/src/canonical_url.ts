const TRACKING_PARAMS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "gbraid",
    "wbraid",
    "msclkid",
    "yclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "igshid",
    "_hsenc",
    "_hsmi"
];

export const canonicalise_url = (input: string): string => {
    const url = new URL(input);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`Unsupported URL scheme: ${url.protocol}`);
    }

    if (url.username || url.password) {
        throw new Error("URL must not contain userinfo");
    }

    // collapse trailing slash, but not the root path "/"
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
        path = path.slice(0, -1);
    }

    // drop tracking params and sort the rest for consistent ordering
    const params = new URLSearchParams(url.search);
    for (const key of TRACKING_PARAMS) params.delete(key);
    params.sort();
    const query = params.toString();

    // ignore fragment
    return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ""}`;
}
