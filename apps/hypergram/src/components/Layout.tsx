import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import React, { useEffect } from "react";

import { HostManifestProvider, useHostManifest } from "../contexts/HostManifestContext";
import { Header } from "./Header";


const LayoutInternal = ({children, className = ""}: {children: React.ReactNode, className?: string}) => {
    const {loading, error, manifest} = useHostManifest();

    useEffect(() => {
        document.title = manifest?.name || "Hypergram";
    }, [manifest]);

    return (
        <main className={`p-5 bg-gray-800 min-h-screen text-white flex flex-col ${className}`}>
            {loading && <LoadingSpinner className="m-auto" />}
            {error && <p className="text-red-400 m-auto">{error}</p>}
            {!loading && !error && (
                <>
                    <Header />
                    {children}
                </>
            )}
        </main>
    );
}

export const Layout = (props: {children: React.ReactNode, className?: string}) => (
    <HostManifestProvider>
        <LayoutInternal {...props} />
    </HostManifestProvider>
);

// TODO: might be best converted to a next.js static app
