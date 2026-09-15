import { parse_identity, resolve_static_record, static_verify_signature } from "@hyperlinkvr/auth";

import type { AuthAdapter } from "./auth";

export interface SignatureAuthOptions {
    token_secret: string;
    token_ttl_ms?: number;
    // how far the signed timestamp may drift from the host clock, in ms. default 5 min.
    max_signature_skew_ms?: number;
}

const encoder = new TextEncoder();

const to_b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const from_b64url = (text: string) =>
    Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

interface TokenPayload {
    sub: string; // identity username, e.g. grace@example.com
    exp: number; // ms since epoch
}

// default auth adapter accepting game signatures only, no web auth
// it is likely that adapters adding wbe auth would wrap around this to still use this signature logic
export const create_signature_auth = ({
    token_secret,
    token_ttl_ms = 24 * 60 * 60 * 1000,
    max_signature_skew_ms = 5 * 60 * 1000
}: SignatureAuthOptions): AuthAdapter => {
    const hmac_key = crypto.subtle.importKey("raw", encoder.encode(token_secret), { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
        "verify"
    ]);

    const sign_token = async (payload: TokenPayload): Promise<string> => {
        const body = to_b64url(encoder.encode(JSON.stringify(payload)));
        const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmac_key, encoder.encode(body)));
        return `${body}.${to_b64url(signature)}`;
    };

    const verify_token = async (token: string): Promise<string | null> => {
        const [body, signature] = token.split(".");
        if (!body || !signature) return null;
        if (!(await crypto.subtle.verify("HMAC", await hmac_key, from_b64url(signature), encoder.encode(body)))) return null;
        try {
            const payload = JSON.parse(new TextDecoder().decode(from_b64url(body))) as TokenPayload;
            if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
            return payload.sub;
        } catch {
            return null;
        }
    };

    return {
        authenticate: async (request) => {
            const header = request.headers.get("authorization");
            if (!header?.startsWith("Bearer ")) return null;
            return verify_token(header.slice("Bearer ".length));
        },

        login_game: async (request) => {
            const username = request.headers.get("x-hypergram-identity");
            const signature = request.headers.get("x-hypergram-signature");
            const timestamp = request.headers.get("x-hypergram-signaturetimestamp");
            if (!username || !signature || !timestamp) return null;

            if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > max_signature_skew_ms) return null;

            const parsed = parse_identity(username);
            if (!parsed.success) return null;

            const resolution = await resolve_static_record(parsed.identity);
            if (!resolution.success || !resolution.record) return null;

            if (!(await static_verify_signature(timestamp, signature, resolution.record.auth.public_key))) return null;

            return sign_token({ sub: username, exp: Date.now() + token_ttl_ms });
        }
    };
};
