import { Header } from "./Header";
import React from "react";
import { HostManifestProvider, useHostManifest } from "../contexts/HostManifestContext";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";

const LayoutInternal = ({children, className = ""}: {children: React.ReactNode, className?: string}) => {
    const {loading, error} = useHostManifest();

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
