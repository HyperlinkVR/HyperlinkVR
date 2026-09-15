import { sign_with_private_key } from "@hyperlinkvr/auth";
import { api_v1_auth_contract, api_v1_read_contract, api_v1_write_contract, HostManifest } from "@hyperlinkvr/hypergram-schemas/v1";
import { useAuthHostManifest, useAuthSession, useSetting, useStorageEngine } from "@hyperlinkvr/react";
import { initClient } from "@ts-rest/core";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, useCallback } from "react";

interface HypergramContextType {
    active: boolean;
    manifest?: HostManifest;
    login?: () => Promise<boolean>;
    post_photo?: (file: File, caption?: string) => Promise<boolean>;
}

const HypergramContext = createContext<HypergramContextType>({
    active: false
});

export const HypergramProvider = ({ children }: { children: ReactNode }) => {
    const session = useAuthSession();
    const auth_manifest = useAuthHostManifest();
    const local_storage = useStorageEngine("local");
    const session_storage = useStorageEngine("session");

    const [read_base_override] = useSetting("devtools_hypergram_override");

    const read_base = read_base_override || auth_manifest?.hypergram_read_api_base;

    const read_client = useMemo(
        () => (read_base ? initClient(api_v1_read_contract, { baseUrl: read_base.replace(/\/$/, "") }) : null),
        [read_base]
    );

    const [manifest, setManifest] = useState<HostManifest | null>(null);

    // use the read client to fetch the hypergram manifest from the host
    useEffect(() => {
        if (!read_client) {
            setManifest(null);
            return;
        }

        let cancelled = false;
        read_client
            .get_manifest()
            .then((response) => {
                if (cancelled) return;
                if (response.status === 200) {
                    setManifest(response.body);
                } else {
                    console.error("Failed to fetch hypergram manifest:", response);
                    setManifest(null);
                }
            })
            .catch((err) => {
                if (!cancelled) console.error("Error fetching hypergram manifest:", err);
            });

        return () => {
            cancelled = true;
        };
    }, [read_client]);

    const token_ref = useRef<string | null>(null);
    const login_ref = useRef<Promise<boolean> | null>(null); // dedupes concurrent logins

    const write_base = manifest?.bases?.write ?? auth_manifest?.hypergram_read_api_base;
    const auth_base = manifest?.bases?.auth ?? auth_manifest?.hypergram_read_api_base;

    // create the write and auth clients based on the manifest
    const write_client = useMemo(
        () =>
            write_base
                ? initClient(api_v1_write_contract, {
                      baseUrl: write_base.replace(/\/$/, ""),
                      baseHeaders: {
                          Authorization: () => (token_ref.current ? `Bearer ${token_ref.current}` : "")
                      }
                  })
                : null,
        [write_base]
    );

    const auth_client = useMemo(
        () => (auth_base ? initClient(api_v1_auth_contract, { baseUrl: auth_base.replace(/\/$/, "") }) : null),
        [auth_base]
    );

    // authenticate on demand (first post, or call to prewarm) so opening the game doesn't hit the auth service
    const login = useCallback(async (): Promise<boolean> => {
        if (token_ref.current) return true;
        if (!session || !auth_client || !manifest?.auth.login) return false;
        if (login_ref.current) return login_ref.current;

        login_ref.current = (async () => {
            try {
                const stored = await session_storage.get<string>("hypergram_token");
                if (stored) {
                    token_ref.current = stored;
                    return true;
                }

                const timestamp = Date.now().toString();
                const signature = await sign_with_private_key(timestamp, local_storage, session.identity, session.method);
                if (!signature) return false;

                const response = await auth_client.login_game({
                    headers: {
                        "x-hypergram-identity": session.username,
                        "x-hypergram-signature": signature,
                        "x-hypergram-signaturetimestamp": timestamp
                    }
                });

                if (response.status === 200) {
                    token_ref.current = response.body.token;
                    await session_storage.set("hypergram_token", response.body.token);
                    return true;
                }

                console.error("Hypergram login rejected:", response);
                token_ref.current = null;
                await session_storage.remove("hypergram_token");
                return false;
            } catch (err) {
                console.error("Hypergram login failed:", err);
                return false;
            } finally {
                login_ref.current = null;
            }
        })();

        return login_ref.current;
    }, [session, auth_client, manifest, local_storage, session_storage]);

    const post_photo = useCallback(
        async (file: File, caption = "") => {
            if (!write_client || !manifest?.auth.login) {
                console.error("Cannot post photo: hypergram not available on this host");
                return false;
            }

            if (!token_ref.current && !(await login())) return false;

            const upload = () => write_client.upload_post({ body: { image: file, metadata: { caption } } });

            let response = await upload();

            // a stored token may be expired server-side, re-authenticate once and retry
            if (response.status === 401 || response.status === 403) {
                token_ref.current = null;
                await session_storage.remove("hypergram_token");
                if (!(await login())) return false;
                response = await upload();
            }

            if (response.status === 201) {
                return response.body.success;
            } else {
                console.error("Failed to upload post:", response);
                return false;
            }
        },
        [write_client, manifest, login, session_storage]
    );

    const value = useMemo<HypergramContextType>(() => {
        const available = !!write_client && !!manifest?.auth.login;
        return {
            active: available,
            manifest: manifest ?? undefined,
            login: available ? login : undefined,
            post_photo: available ? post_photo : undefined
        };
    }, [write_client, manifest, login, post_photo]);

    return <HypergramContext.Provider value={value}>{children}</HypergramContext.Provider>;
};

export const useHypergram = () => {
    const context = useContext(HypergramContext);
    if (!context) {
        throw new Error("useHypergram must be used within a HypergramProvider");
    }
    return context;
}
