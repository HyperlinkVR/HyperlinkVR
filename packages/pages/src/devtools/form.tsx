import { AuthManifestSchema, sign_with_private_key, verify_signature } from "@hyperlinkvr/auth";
import { useAuthSession, useStorageEngine } from "@hyperlinkvr/react";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import { WorldMetadataSchema } from "@hyperlinkvr/vr-engine-schemas";
import { lazy, Suspense, useEffect, useRef, useState } from "react";


// lazy load schema form to avoid loading css on wrong pages / bundle bloat
// in regards to css it shouldn't be strictly necessary but may as well give vite an easier time, especially since this bundle will be big anyway with mantine
// TODO: look into scoping the css to the schemaform
const SchemaForm = lazy(() => import("@hyperlinkvr/schema-form").then((module) => ({ default: module.SchemaForm })));

const SCHEMAS = {
    AuthManifest: {
        schema: AuthManifestSchema,
        title: "Auth Manifest Generator"
    },
    WorldMetadata: {
        schema: WorldMetadataSchema,
        title: "World Metadata Generator",
        field_overrides: {
            "author.username": ({ value, set_value, error }) => {
                const auth = useAuthSession();
                const username = auth?.username;
                const defaulted = useRef(false);

                useEffect(() => {
                    if (!defaulted.current && username && !value) {
                        defaulted.current = true;
                        set_value(username);
                    }
                }, [username, value, set_value]);

                return (
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                        username@host:

                        <input
                            style={{ border: "1px solid #ccc", borderRadius: "4px", padding: "4px" }}
                            type="text"
                            value={value || ""}
                            onChange={(e) => set_value(e.target.value)}
                            placeholder="Enter your username"
                        />

                        {error && <span style={{ color: "#dc3545", fontSize: "0.85rem" }}>{error}</span>}
                    </label>
                );
            },
            "author.signature": ({ value, set_value, error, set_error, set_warning }) => {
                const auth = useAuthSession();
                const public_key = auth?.public_key;
                const method = auth?.method;

                const [world_url, setWorldURL] = useState("");
                const [confirmed, setConfirmed] = useState<boolean | null>(null);

                const is_empty = !value;
                useEffect(() => {
                    set_warning(is_empty ? "Author signature is empty! This world will be published unsigned." : null);
                }, [is_empty, set_warning]);

                useEffect(() => {
                    if (!value || !public_key || !method || !world_url) {
                        setConfirmed(null);
                        set_error(null);
                        return;
                    }

                    verify_signature(world_url, value, public_key, method).then((result) => {
                        setConfirmed(result);
                        set_error(result ? null : "Author signature is invalid for this world URL.");
                    }).catch((err) => {
                        console.error("Error verifying signature:", err);
                        setConfirmed(false);
                        set_error("Could not verify the author signature.");
                    });
                }, [value, public_key, method, world_url, set_error]);

                const local_storage = useStorageEngine("local");

                if (!auth) {
                    return <div>Log in to sign the world.</div>
                }

                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            World URL for signing (must match the URL your world is loaded from exactly):
                            <input
                                style={{ border: "1px solid #ccc", borderRadius: "4px", padding: "4px" }}
                                type="text"
                                value={world_url}
                                onChange={(e) => setWorldURL(e.target.value)}
                            />
                        </label>

                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                type="button"
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: confirmed === null ? "#007bff" : confirmed ? "#28a745" : "#dc3545",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                                onClick={async () => {
                                    // strip trailing slash from world_url if present
                                    let stripped_world_url = world_url;
                                    if (stripped_world_url.endsWith("/")) {
                                        stripped_world_url = stripped_world_url.slice(0, -1);
                                    }
                                    setWorldURL(stripped_world_url);

                                    const signature = await sign_with_private_key(stripped_world_url, local_storage, auth!.identity, auth!.method);

                                    if (!signature) {
                                        alert("Failed to sign world. Try logging in again.");
                                        return;
                                    }

                                    set_value(signature);
                                }}
                            >
                                {confirmed === null ? "Sign world" : confirmed ? "Signature valid ✅" : "Signature invalid ❌"}
                            </button>

                            {value && (
                                <button
                                    type="button"
                                    style={{
                                        padding: "0.5rem 1rem",
                                        backgroundColor: "transparent",
                                        color: "#dc3545",
                                        border: "1px solid #dc3545",
                                        borderRadius: "4px",
                                        cursor: "pointer"
                                    }}
                                    onClick={() => set_value(undefined)}
                                >
                                    Clear signature
                                </button>
                            )}
                        </div>

                        {!value && (
                            <span style={{ color: "#b8860b", fontSize: "0.85rem" }}>
                                No signature! This world will be published unsigned.
                            </span>
                        )}
                        {confirmed === false && (
                            <span style={{ color: "#dc3545", fontSize: "0.85rem" }}>
                                Signature is invalid for this world URL.
                            </span>
                        )}
                        {error && <span style={{ color: "#dc3545", fontSize: "0.85rem" }}>{error}</span>}
                    </div>
                );
            }
            // NOTE: additional_contributors is a union (string | object) and is now
            // rendered automatically by SchemaForm's generic UnionField, so it no
            // longer needs a custom override here.
        }
    }
} as Record<string, { schema: any; title: string, field_overrides?: Record<string, React.ComponentType<any>> }>;

// TODO: use strategy
const params = new URLSearchParams(window.location.search);
const schema_name = params.get("schema");
const schema = schema_name ? SCHEMAS[schema_name] : null;
const output_format = params.get("format") || "json";
const output_filename = params.get("filename");

const download_json = (data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 4)], {
        type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
        `${output_filename}.json` || `${schema_name}_v${data.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

const FORMATS = {
    json: download_json
} as Record<string, (data: any) => void>;

const download_form = (data: any) => {
    console.log("Downloading form data", data);
    const format_func = FORMATS[output_format];
    if (!format_func) {
        console.error(`Unknown format: ${output_format}`);
        return;
    }
    format_func(data);
};

export const DevToolsFormPage = () => {
    if (!schema) {
        return <div>No schema found</div>;
    }

    if (!FORMATS[output_format]) {
        return <div>Unknown format: {output_format}</div>;
    }

    return (
        <Suspense fallback={<LoadingSpinner />}>
            <SchemaForm
                schema={schema.schema}
                onSubmit={download_form}
                title={schema.title}
                field_overrides={schema.field_overrides || {}}
            />
        </Suspense>
    );
};
