import { z } from "zod";

export const AUTH_METHODS = ["static", "jwt", "passkey"] as const;


export const JWK_EC_Schema = z.object({
    kty: z.literal("EC"),
    crv: z.enum(["P-256", "P-384", "P-521"]),
    x: z.string(),
    y: z.string(),
    ext: z.boolean().optional()
});
export type JWK_EC = z.infer<typeof JWK_EC_Schema>;

export const JWK_OKP_Schema = z.object({
    kty: z.literal("OKP"),
    crv: z.literal("Ed25519"),
    x: z.string(), // Base64url encoded public key
    ext: z.boolean().optional()
});
export type JWK_OKP = z.infer<typeof JWK_OKP_Schema>;

export const PasswordDerivAlgorithmNames = ["argon2"] as const;
export type PasswordDerivAlgorithmName = (typeof PasswordDerivAlgorithmNames)[number];

export const Argon2PasswordDerivCustomDataSchema = z.object({
    salt: z.string(),
    iv: z.string(),
});

export const StaticAuthRecordSchema = z.object({
    password_deriv: z.object({
        algorithm: z.enum(PasswordDerivAlgorithmNames),
        custom: Argon2PasswordDerivCustomDataSchema
    }),
    encrypted_private_key: z.string(),
    public_key: z.union([JWK_EC_Schema, JWK_OKP_Schema]) // TODO: give users the option to store private key themself instead of publishing ciphertext if they so wish
});
export type StaticAuthRecord = z.infer<typeof StaticAuthRecordSchema>;

export const StaticIdentityRecordSchema_VERSION = 1;
export const StaticIdentityRecordSchema = z.object({
    $schema: z
        .string()
        .optional()
        .default(`https://hyperlink.surf/schemas/StaticIdentityRecord_v${StaticIdentityRecordSchema_VERSION}.json`),
    version: z.number().int().min(1).max(StaticIdentityRecordSchema_VERSION),
    identity: z.string().min(3).max(64),
    created_at: z.number(),
    status: z.enum(["active", "suspended"]),
    auth: StaticAuthRecordSchema
}).meta({
    name: "StaticIdentityRecord",
    version: StaticIdentityRecordSchema_VERSION,
    title: "HyperlinkVR - Static Identity Record",
    description: "A static identity record for HyperlinkVR to authenticate users on a static site, under the .well-known/hyperlinkvr/auth/* path."
});
export type StaticIdentityRecord = z.infer<typeof StaticIdentityRecordSchema>;


export const AuthManifestSchema_VERSION = 1;
export const AuthManifestSchema = z
    .object({
        $schema: z
            .string()
            .optional()
            .default(
                `https://hyperlink.surf/schemas/AuthManifest_v${AuthManifestSchema_VERSION}.json`
            ),
        version: z.number().int().min(1).max(AuthManifestSchema_VERSION),

        methods: z
            .array(z.enum(AUTH_METHODS))
            .min(1)
            .describe("Supported authentication methods"),

        host_name: z.string().optional().describe("Host friendly name"),

        host_description: z.string().optional().describe("Host description"),

        host_icon: z.url().optional().describe("Host icon URL"),

        open_for_registration: z.boolean().optional().default(true)
            .describe("Open for registration?"),

        static_submit_hint: z
            .string()
            .optional()
            .describe(
                "[STATIC ONLY] Describe how users can submit their static identity record to the host, e.g. 'Email your static identity record to...', 'open a GitHub PR at ...', 'upload at ...' etc."
            )
    })
    .superRefine((data, ctx) => {
        // static submit hint should not be provided if static auth is not supported
        if (!data.methods.includes("static") && data.static_submit_hint) {
            ctx.addIssue({
                code: "custom",
                message:
                    "static_submit_hint should not be provided if static auth is not supported"
            });
        }
    })
    .meta({
        name: "AuthManifest",
        version: AuthManifestSchema_VERSION,
        title: "HyperlinkVR - Auth Manifest",
        description:
            "An auth manifest for HyperlinkVR to describe the authentication methods supported by a site, as well as friendly display properties, under the .well-known/hyperlinkvr/auth-manifest.json path.",

        // enforce that if static_submit_hint given then must be static method available
        json_schema_extra: {
            if: {
                required: ["static_submit_hint"]
            },
            then: {
                properties: {
                    methods: {
                        contains: { const: "static" }
                    }
                },
                errorMessage: {
                    properties: {
                        methods: "static_submit_hint should not be provided if static auth is not supported"
                    }
                }
            }
        }
    });
export type AuthManifest = z.infer<typeof AuthManifestSchema>;

export const EXPORT_TO_JSON = [
    StaticIdentityRecordSchema,
    AuthManifestSchema
];
