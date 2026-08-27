import { type StorageEngine } from "@hyperlinkvr/core";
//@ts-ignore
import { long } from "@wordlist/english-eff/long";
import { RandomWords } from "@wordlist/random";



import type { StoredKey } from "./core";
import type { Identity } from "@hyperlinkvr/types";
import type { PasswordDerivAlgorithmName} from "./schema";
import { StaticAuthRecordSchema, StaticIdentityRecordSchema, type StaticAuthRecord, type StaticIdentityRecord } from "./schema";


interface SuccessfulRecordResolution {
    success: true;
    record: StaticIdentityRecord | undefined;
}

interface FailedRecordResolution {
    success: false;
    error: string;
}

type StaticRecordResolution =
    | SuccessfulRecordResolution
    | FailedRecordResolution;

export const resolve_static_record = async (
    identity: Identity
): Promise<StaticRecordResolution> => {
    const static_record_response = await fetch(
        `https://${identity.host}/.well-known/hyperlinkvr/auth/${identity.name}.json`
    );

    if (!static_record_response.ok) {
        if (static_record_response.status === 404) {
            return {
                success: true,
                record: undefined
            };
        } else {
            return {
                success: false,
                error: `Failed to fetch static auth record: ${static_record_response.statusText}`
            };
        }
    }

    try {
        const record = await static_record_response.json();

        // validate record against schema
        const { success, error } = StaticIdentityRecordSchema.safeParse(record);
        if (!success) {
            return {
                success: false,
                error: `Invalid static auth record: ${error}`
            };
        }

        return {
            success: true,
            record
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to parse static auth record: ${error}`
        };
    }
};

export const generate_jwk_keys = async () => {
    const keypair = await crypto.subtle.generateKey(
        {
            name: "Ed25519",
        },
        true,
        ["sign", "verify"]
    ) as CryptoKeyPair;

    const public_key = await crypto.subtle.exportKey("jwk", keypair.publicKey);
    const private_key = await crypto.subtle.exportKey("jwk", keypair.privateKey);

    return {
        public_key,
        private_key
    };
}

interface EncryptedPrivateKey {
    algorithm: PasswordDerivAlgorithmName;
    ciphertext: string;
    custom?: Record<string, unknown>;
}

const ARGON2_PARAMS = {
    time: 3,
    mem: 65536,
    hashLen: 32,
    parallelism: 1,
    type: 2
};

export const encrypt_private_key = async (private_key: JsonWebKey, password: string, algorithm: PasswordDerivAlgorithmName = "argon2"): Promise<EncryptedPrivateKey> => {
    switch (algorithm) {
        case "argon2":
            //@ts-ignore
            const argon2 = await import("argon2-browser/lib/argon2.js");

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));

            const hash = await argon2.hash({
                pass: password,
                salt,
                ...ARGON2_PARAMS
            });

            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
                "raw",
                hash.hash as BufferSource,
                { name: "AES-GCM" },
                false,
                ["encrypt"]
            );

            const private_key_bytes = encoder.encode(JSON.stringify(private_key));

            const encrypted_private_key = await crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv
                },
                key,
                private_key_bytes
            );

            return {
                algorithm: "argon2",
                ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted_private_key))),
                custom: {
                    salt: btoa(String.fromCharCode(...salt)),
                    iv: btoa(String.fromCharCode(...iv))
                }
            };
        default:
            throw new Error(`Unsupported password derivation algorithm: ${algorithm}`);
    }
}

export const decrypt_private_key = async (encrypted_private_key: EncryptedPrivateKey, password: string): Promise<JsonWebKey> => {
    switch (encrypted_private_key.algorithm) {
        case "argon2":
            const argon2 = await import("argon2-browser");

            if (!encrypted_private_key.custom?.salt || !encrypted_private_key.custom?.iv) {
                throw new Error("Missing salt or iv for argon2 decryption");
            }

            const salt = Uint8Array.from(atob(encrypted_private_key.custom.salt as string), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(encrypted_private_key.custom.iv as string), c => c.charCodeAt(0));

            const hash = await argon2.hash({
                pass: password,
                salt,
                ...ARGON2_PARAMS
            });

            const key = await crypto.subtle.importKey(
                "raw",
                hash.hash as BufferSource,
                { name: "AES-GCM" },
                false,
                ["decrypt"]
            );

            const encrypted_private_key_bytes = Uint8Array.from(atob(encrypted_private_key.ciphertext), c => c.charCodeAt(0));

            const decrypted_private_key_bytes = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv
                },
                key,
                encrypted_private_key_bytes
            );

            const decoder = new TextDecoder();
            const decrypted_private_key_json = decoder.decode(decrypted_private_key_bytes);

            return JSON.parse(decrypted_private_key_json);
        default:
            throw new Error(`Unsupported password derivation algorithm: ${encrypted_private_key.algorithm}`);
    }
}

export const generate_auth_record = async (public_key: JsonWebKey, encrypted_private_key: EncryptedPrivateKey): Promise<StaticAuthRecord> => {
    return StaticAuthRecordSchema.parse({
        password_deriv: {...encrypted_private_key, ciphertext: undefined},
        encrypted_private_key: encrypted_private_key.ciphertext,
        public_key
    });
}

export const generate_static_identity_record = async (identity: Identity, auth: StaticAuthRecord, status: "active" | "suspended" = "active"): Promise<StaticIdentityRecord> => {
    const created_at = Date.now();

    return StaticIdentityRecordSchema.parse({
        version: 1,
        identity: `${identity.name}@${identity.host}`,
        created_at,
        status,
        auth
    });
}

// stores the encrypted private key to allow logging back in without retrieving record. not the same as the decrypted key in the auth state
export const store_encrypted_private_key = async (identity: Identity, encrypted_private_key: EncryptedPrivateKey, storage: StorageEngine<"local">) => {
    const key_identifier = `keystore:${identity.name}@${identity.host}`;

    if (await storage.get(key_identifier)) {
        throw new Error(`Private key for ${identity.name}@${identity.host} already exists in storage`);
    }

    await storage.set(key_identifier, {
        method: "static",
        key: encrypted_private_key
    });
}

export const store_public_key = async (identity: Identity, public_key: JsonWebKey, storage: StorageEngine<"local">) => {
    const key_identifier = `keystore-pub:${identity.name}@${identity.host}`;

    if (await storage.get(key_identifier)) {
        throw new Error(`Public key for ${identity.name}@${identity.host} already exists in storage`);
    }

    await storage.set(key_identifier, {
        method: "static",
        key: public_key
    });
}

export const generate_password = async (words: number = 4): Promise<string> => {
    const random_words = new RandomWords(long);
    return (await random_words.generate(4)).join("-");
}

export const signup_static = async (identity: Identity, local_storage: StorageEngine<"local">): Promise<{static_record: StaticIdentityRecord, password: string, public_key: JsonWebKey}> => {
    const { public_key, private_key } = await generate_jwk_keys();
    const password = await generate_password();

    const encrypted_private_key = await encrypt_private_key(private_key, password);

    const auth_record = await generate_auth_record(public_key, encrypted_private_key);
    const static_record = await generate_static_identity_record(identity, auth_record);

    await store_encrypted_private_key(identity, encrypted_private_key, local_storage);
    await store_public_key(identity, public_key, local_storage);

    // TODO: should we sanity check the keys?
    return {static_record, password, public_key};
}

export const is_private_key_stored = async (storage: StorageEngine<"local">): Promise<boolean> => {
    const live_key = await storage.get<JsonWebKey | undefined>("auth_session_static_key");
    return !!live_key;
}

export const request_private_key = async (
    identity: Identity,
    storage: {
        local: StorageEngine<"local">,
        // session: StorageEngine<"session">
    },
    params?: {
        password?: string;
        force_password?: boolean;
    }
): Promise<JsonWebKey | null> => {
    if (!params?.force_password) {
        const live_key = await storage.local.get<JsonWebKey | undefined>("auth_session_static_key");
        if (live_key) {
            return live_key;
        }
    }
    
    // check if the private key is stored in local storage
    let effective_key: string | undefined;
    let algorithm: PasswordDerivAlgorithmName | undefined;
    let salt: string | undefined;
    let iv: string | undefined;
    
    const key_identifier = `keystore:${identity.name}@${identity.host}`;
    const stored_key = await storage.local.get<StoredKey | undefined>(key_identifier);
    if (stored_key && stored_key.method === "static" && stored_key.custom?.algorithm && stored_key.custom?.salt && stored_key.custom?.iv) {
        effective_key = stored_key.key as string;
        algorithm = stored_key.custom.algorithm as PasswordDerivAlgorithmName;
        salt = stored_key.custom.salt as string;
        iv = stored_key.custom.iv as string;
    } else {
        // fetch record from host
        const static_record_resolution = await resolve_static_record(identity);
        if (!static_record_resolution.success) {
            console.error("Failed to resolve static record:", static_record_resolution.error);
            return null;
        }

        if (!static_record_resolution.record) {
            console.error("No static record found for identity:", identity);
            return null;
        }
        
        effective_key = static_record_resolution.record.auth.encrypted_private_key;
        algorithm = static_record_resolution.record.auth.password_deriv.algorithm;
        salt = static_record_resolution.record.auth.password_deriv.custom?.salt;
        iv = static_record_resolution.record.auth.password_deriv.custom?.iv;
    }
    
    if (!effective_key || !algorithm || !salt || !iv) {
        console.error("Missing encrypted private key or password derivation parameters");
        return null;
    }
    
    // decrypt the private key with the password
    if (!params?.password) {
        throw new Error("Password is required to decrypt the private key");
    }
    
    const encrypted_private_key: EncryptedPrivateKey = {
        algorithm,
        ciphertext: effective_key,
        custom: {
            salt,
            iv
        }
    };
    
    try {
        const private_key = await decrypt_private_key(encrypted_private_key, params.password);
        // store the decrypted private key for later use
        await storage.local.set("auth_session_static_key", private_key);
        return private_key;
    } catch (error) {
        console.error("Failed to decrypt private key:", error);
        return null;
    }
};

export const check_stored_private_key = async (
    identity: Identity,
    storage: {
        local: StorageEngine<"local">;
        //session: StorageEngine<"session">;
    },
    params?: {
        challenge?: string;
        password?: string;
        require_password?: boolean;
    }
): Promise<boolean> => {
    const private_key = await request_private_key(identity, storage, params);
    if (!private_key) {
        return false;
    }

    return await check_private_key(identity, private_key, params);
}

export const check_private_key = async (
    identity: Identity,
    private_key: JsonWebKey,
    params?: {
        challenge?: string;
        public_key?: JsonWebKey;
    }
): Promise<boolean> => {
    const challenge = params?.challenge || crypto.randomUUID();

    // sign the challenge with the private key
    const private_key_obj = await crypto.subtle.importKey(
        "jwk",
        private_key,
        {
            name: "Ed25519"
        },
        false,
        ["sign"]
    );

    const encoder = new TextEncoder();
    const challenge_bytes = encoder.encode(challenge);

    const signature = await crypto.subtle.sign(
        {
            name: "Ed25519"
        },
        private_key_obj,
        challenge_bytes
    );

    let effective_public_key: JsonWebKey | undefined;
    if (params?.public_key) {
        effective_public_key = params.public_key;
    } else {
        // fetch public key from host
        const static_record_resolution = await resolve_static_record(identity);
        if (!static_record_resolution.success) {
            console.error("Failed to resolve static record:", static_record_resolution.error);
            return false;
        }

        if (!static_record_resolution.record) {
            console.error("No static record found for identity:", identity);
            return false;
        }

        effective_public_key = static_record_resolution.record.auth.public_key;
    }

    if (!effective_public_key) {
        console.error("Missing public key for verification");
        return false;
    }

    // verify the signature with the public key
    const public_key_obj = await crypto.subtle.importKey(
        "jwk",
        effective_public_key,
        {
            name: "Ed25519"
        },
        false,
        ["verify"]
    );

    const is_valid = await crypto.subtle.verify(
        {
            name: "Ed25519"
        },
        public_key_obj,
        signature,
        challenge_bytes
    );

    if (!is_valid) {
        console.error("Invalid signature for challenge");
        return false;
    }

    return true;
};
