import { z } from "zod";

import { IdentitySchema, URLSchema } from "./common";

export const MAX_SIGNATURE_SKEW_MS = 5 * 60 * 1000;

export const SignatureHeadersSchema = {
    "x-hypergram-author": IdentitySchema,
    "x-hypergram-ts": z.string().regex(/^\d+$/), // ms since epoch when signed
    "x-hypergram-signature": z.string() // base64 ed25519 signature over build_signing_payload
};

export const build_signing_payload = (params: {
    method: string;
    host: string;
    path: string;
    ts: number;
    body_digests: string[];
}) => [params.method.toUpperCase(), params.host, params.path, params.ts, ...params.body_digests].join("\n");

export const BearerLoginResultSchema = z.object({
    token: z.string().min(1),
    identity: IdentitySchema
});
export type BearerLoginResult = z.infer<typeof BearerLoginResultSchema>;


export const WriteAuthMethodSchema = z.discriminatedUnion("method", [
    z.object({
        method: z.literal("hyperlinkvr_signature")
    }),
    z.object({
        method: z.literal("bearer"),
        login_url: URLSchema
    })
]);
export type WriteAuthMethod = z.infer<typeof WriteAuthMethodSchema>;
