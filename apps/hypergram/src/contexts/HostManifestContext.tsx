import { type HostManifest } from "@hyperlinkvr/hypergram-schemas/v1";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { read_client } from "../api_client";
import { human_status } from "../util/human_status";

interface HostManifestContextType {
    loading: boolean;
    error: string | null;
    manifest: HostManifest | null;
}

const HostManifestContext = createContext<HostManifestContextType | null>(null);

export const HostManifestProvider = ({children}: {children: React.ReactNode}) => {
    const [manifest, setManifest] = useState<HostManifest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const client = useMemo(() => read_client(), []);

    useEffect(() => {
        client.get_manifest().then(res => {
            setLoading(false);

            if (res.status !== 200) {
                console.error("Failed to fetch manifest", res.status, res.body);
                setError(human_status(res.status));
                return;
            }

            setManifest(res.body);
        }).catch(err => {
            console.error("Error fetching manifest", err);
            setLoading(false);
            setError("Error while fetching manifest");
        });
    }, []);

    return (
        <HostManifestContext.Provider value={{
            loading,
            error,
            manifest
        }}>
            {children}
        </HostManifestContext.Provider>
    );
}

export const useHostManifest = () => {
    const context = useContext(HostManifestContext);
    if (!context) {
        throw new Error("useHostManifest must be used in a HostManifestProvider")
    }

    return context;
}
