import { AuthManifestSchema, sign_with_private_key, verify_signature } from "@hyperlinkvr/auth";
import { useAuthSession, useStorageEngine } from "@hyperlinkvr/react";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import { WorldMetadataSchema } from "@hyperlinkvr/vr-engine-schemas";
import { lazy, Suspense, useEffect, useState } from "react";


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
            "author.username": ({ value, set_value }) => {
                // default to logged in username if available
                const auth = useAuthSession();

                useEffect(() => {
                    if (auth && !value) {
                        set_value(auth.username);
                    }
                }, [auth, value, set_value]);

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
                    </label>
                );
            },
            "author.signature": ({ value, set_value }) => {
                const auth = useAuthSession();

                const [world_url, setWorldURL] = useState("");
                const [confirmed, setConfirmed] = useState<boolean | null>(null);

                useEffect(() => {
                    if (!value || !auth) {
                        setConfirmed(null);
                        return;
                    }

                    // when signature value is set, verify against the pubkey
                    verify_signature(world_url, value, auth.public_key, auth.method).then((result) => {
                        setConfirmed(result);
                    }).catch((err) => {
                        console.error("Error verifying signature:", err);
                        setConfirmed(false);
                    });
                }, [value, auth, world_url]);

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

                        <button
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
                    </div>
                );
            }
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
