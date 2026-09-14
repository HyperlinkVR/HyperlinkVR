import { AuthManifest, fetch_auth_manifest } from "@hyperlinkvr/auth";
import { useEffect, useState } from "react";

import { useAuthSession } from "../contexts";

export const useAuthHostManifest = () => {
    const auth = useAuthSession();
    const [manifest, setManifest] = useState<AuthManifest | null>(null);

    useEffect(() => {
        if (!auth) {
            setManifest(null);
            return;
        }

        fetch_auth_manifest(auth.identity.host)
            .then((manifest) => setManifest(manifest))
            .catch((err) => {
                console.error("Failed to fetch auth manifest:", err);
                setManifest(null);
            });
    }, []);

    return manifest;
}
