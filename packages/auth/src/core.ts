import type { StorageEngine } from "@hyperlinkvr/core";
import type { Identity } from "@hyperlinkvr/types";

import type {
    AUTH_METHODS} from "./schema";
import {
    AuthManifestSchema,
    type AuthManifest,
    type StaticIdentityRecord
} from "./schema";
import { resolve_static_record, static_sign_with_private_key, static_verify_signature } from "./static";

export type LoginMethod = (typeof AUTH_METHODS)[number];

export type LoginAction = "login" | "signup";

interface SuccessfulIdentityParse {
    success: true;
    identity: Identity;
}

interface FailedIdentityParse {
    success: false;
    error: string;
}

type IdentityParseResult = SuccessfulIdentityParse | FailedIdentityParse;

export const parse_identity = (username: string): IdentityParseResult => {
    // parse username into identity
    const parts = username.split("@");
    if (parts.length !== 2) {
        return {
            success: false,
            error: "Invalid username format. Use name@host.com"
        };
    }

    const [name, host] = parts;
    if (!name || !host) {
        return {
            success: false,
            error: "Invalid username format. Use name@host.com"
        };
    }

    return {
        success: true,
        identity: {
            name,
            host
        }
    };
};

export interface StoredKey {
    method: LoginMethod;
    key: string | JsonWebKey;
    custom?: Record<string, unknown>;
}

export type ActionableMethods = Partial<Record<LoginMethod, LoginAction[]>>;

export interface IdentityResolutionData {
    allowed: ActionableMethods;
    auth_manifest?: AuthManifest;
    private_key?: StoredKey;
    static_record?: StaticIdentityRecord;
    public_key?: StoredKey;
}

interface SuccessfulIdentityResolution extends IdentityResolutionData {
    resolved: true;
}

interface FailedIdentityResolution {
    resolved: false;
    allowed: {};
    error?: string;
}

type IdentityResolution =
    | SuccessfulIdentityResolution
    | FailedIdentityResolution;

export const resolve_identity = async (
    identity: Identity,
    storage: StorageEngine<"local">
): Promise<IdentityResolution> => {
    // first, check if a local key already exists, which can be logged in immediately
    // TODO: move this logic to static.ts
    const private_key = await storage.get<StoredKey>(
        `keystore:${identity.name}@${identity.host}`
    );

    if (private_key) {
        const public_key = await storage.get<StoredKey>(
            `keystore-pub:${identity.name}@${identity.host}`
        );

        if (public_key) {
            return {
                resolved: true,
                allowed: {
                    [private_key.method]: ["login"]
                },
                private_key,
                public_key
            };
        }
    }

    // now reach out to the host to see what auth methods they support
    // TODO: handle host more safely
    const manifest_response = await fetch(
        `https://${identity.host}/.well-known/hyperlinkvr/auth-manifest.json`
    );
    if (!manifest_response.ok) {
        return {
            resolved: false,
            allowed: {},
            error: `Failed to fetch auth manifest from host: ${manifest_response.statusText}`
        };
    }

    const manifest_data = await manifest_response.json();
    if (!manifest_data) {
        return {
            resolved: false,
            allowed: {},
            error: "Auth manifest is empty"
        };
    }

    // validate manifest against schema
    const { success, error } = AuthManifestSchema.safeParse(manifest_data);
    if (!success) {
        return {
            resolved: false,
            allowed: {},
            error: `Invalid auth manifest: ${error}`
        };
    }

    const auth_manifest = manifest_data as AuthManifest;
    const { methods } = auth_manifest;

    // if only one method is supported, select it automatically
    if (methods.length === 1) {
        // if the method is static, check for a static record first
        if (methods[0] === "static") {
            const static_record = await resolve_static_record(identity);

            if (static_record.success && static_record.record) {
                return {
                    resolved: true,
                    auth_manifest,
                    allowed: {
                        static: ["login"]
                    },
                    static_record: static_record.record,
                    public_key: {
                        method: "static",
                        key: static_record.record.auth.public_key
                    }
                };
            } else if (
                static_record.success &&
                static_record.record === undefined
            ) {
                // doesnt exist so only offer signup
                return {
                    resolved: true,
                    auth_manifest,
                    allowed: {
                        static: ["signup"]
                    }
                };
            } else if (!static_record.success) {
                // error fetching static record
                return {
                    resolved: false,
                    error: static_record.error,
                    allowed: {}
                };
            }
        } else if (methods[0] === "jwt") {
            // jwt doesnt distinguish login and signup
            return {
                resolved: true,
                auth_manifest,
                allowed: {
                    jwt: ["login"]
                }
            };
        }
    } else {
        // determine auth method by checking for a static record for the user
        const static_record = await resolve_static_record(identity);

        if (static_record.success && static_record.record) {
            return {
                resolved: true,
                auth_manifest,
                allowed: {
                    static: ["login"]
                },
                static_record: static_record.record,
                public_key: {
                    method: "static",
                    key: static_record.record.auth.public_key
                }
            };
        } else if (
            static_record.success &&
            static_record.record === undefined
        ) {
            // doesnt exist, offer static signup or jwt login/signup (same thing)
            return {
                resolved: true,
                auth_manifest,
                allowed: {
                    static: ["signup"],
                    jwt: ["login"]
                }
            };
        } else if (!static_record.success) {
            // error fetching static record
            return {
                resolved: false,
                error: static_record.error,
                allowed: {}
            };
        }
    }

    return {
        resolved: false,
        allowed: {},
        error: "No valid auth methods available"
    }
};

interface AuthSessionToStore {
    identity: Identity;
    method: LoginMethod;
    public_key: JsonWebKey;
    authed_at?: number;
}

export interface AuthSession extends AuthSessionToStore {
    username: string;
    authed_at: number;
    avatar_url?: string;
}

export const store_auth_session = async (
    session: AuthSessionToStore,
    storage: StorageEngine<"local">
): Promise<AuthSession> => {
    const to_commit = session as AuthSession;

    if (!session.authed_at) {
        to_commit.authed_at = Date.now();
    }

    to_commit.username = `${session.identity.name}@${session.identity.host}`;

    await storage.set("auth_session", to_commit);
    return session as AuthSession;
}

export const read_auth_session = async (
    storage: StorageEngine<"local">
): Promise<AuthSession | null> => {
    const session = await storage.get<AuthSession>("auth_session");
    return session || null;
}

export const sign_with_private_key = async (
    data: string,
    storage: StorageEngine<"local">,
    identity: Identity,
    method: LoginMethod
): Promise<string | null> => {
    if (method === "static") {
        return await static_sign_with_private_key(data, storage, identity);
    } else {
        throw new Error(`Unsupported signing method: ${method}`);
    }
}

export const verify_signature = async (
    data: string,
    signature: string,
    public_key: JsonWebKey,
    method: LoginMethod
): Promise<boolean> => {
    if (method === "static") {
        return await static_verify_signature(data, signature, public_key);
    } else {
        throw new Error(`Unsupported signature verification method: ${method}`);
    }
}

export const verify_from_username = async (
    data: string,
    signature: string,
    username: string,
    storage: StorageEngine<"local">
): Promise<boolean> => {
    const identity_parse = parse_identity(username);
    if (!identity_parse.success) {
        throw new Error(`Invalid username: ${identity_parse.error}`);
    }

    const identity = identity_parse.identity;
    const resolution = await resolve_identity(identity, storage);

    if (!resolution.resolved) {
        throw new Error(`Failed to resolve identity: ${resolution.error}`);
    }

    if (resolution.public_key && resolution.public_key.key) {
        return await verify_signature(
            data,
            signature,
            resolution.public_key.key as JsonWebKey,
            resolution.public_key.method
        );
    } else {
        throw new Error("No public key available for verification");
    }
};

// TODO: force impls to expose a fixed interface (e.g. signup, try_login etc)
// TODO: force lowercase names? any other restrictions? and dont forget to normalise the host part to lowercase as well
