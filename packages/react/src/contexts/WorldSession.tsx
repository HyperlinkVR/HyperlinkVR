import type { EventMessage } from "@hyperlinkvr/types";
import { createContext, useContext, useEffect, useRef, useState } from "react";


import { useMessageEngine } from "./engines";
import { useWindowArguments } from "./windowing";


export type SupportMeta = "supported" | "defer" | "disable";

export interface WorldSessionContextValue {
    id: number;
    url: string | null;
    tab_dimensions: {
        width: number;
        height: number;
    } | null;
    support: SupportMeta | null;
    // increments once per document (every HVR_META_UPDATE), even when the
    // meta value itself is unchanged. effect on this to reset world state.
    doc_generation: number;

    // false for navigations not initiated by the user or extension
    nav_authorised: boolean;
}

const WorldSessionContext = createContext<WorldSessionContextValue | null>(null);

export const WorldSessionProvider = ({children}: { children: React.ReactNode; }) => {
    const window_data = useWindowArguments();

    if (!window_data.tab) {
        throw new Error("TabSessionProvider must be used within a window with a tab argument");
    }

    const { tab: tab_str } = window_data;
    const tab = parseInt(tab_str, 10);

    const messenger = useMessageEngine();

    const [url, setUrl] = useState<string | null>(null);
    const [tab_dimensions, setTabDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);
    const [support, setSupport] = useState<SupportMeta | null>(null);
    const [doc_generation, setDocGeneration] = useState(0);

    const [nav_authorised, setNavAuthorised] = useState(true);
    const nav_authorised_live = useRef(true);

    useEffect(() => {
        const channel = messenger.connect<never, EventMessage>(`hvr-tab-session:${tab}`);

        const unlisten = channel.listen(async (msg) => {
            console.log("TabSessionProvider received update:", msg);
            if (msg.type === "HVR_TAB_CLOSED" && msg.tab === tab) {
                window.close();
                return;
            }

            if (msg.type === "HVR_URL_UPDATE") {
                setUrl(msg.url);

                // no flag defaults to authorised
                nav_authorised_live.current = msg.authorised ?? true;
            }

            if (msg.type === "HVR_DIMENSIONS_UPDATE") {
                setTabDimensions({ width: msg.width, height: msg.height });
            }

            if (msg.type === "HVR_META_UPDATE") {
                setSupport(msg.content);
                // a replay is the background re-sending the cached meta to a newly connected window (hydration)
                // the meta value still needs to update, but it is not a new document, so don't bump the generation
                if (!msg.replay) {
                    setDocGeneration((previous) => previous + 1);
                    setNavAuthorised(nav_authorised_live.current);
                }
            }
        });

        return () => {
            unlisten();
            channel.disconnect();
        };
    }, [messenger, tab]);

    return (
        <WorldSessionContext.Provider
            value={{
                id: tab,
                url,
                tab_dimensions,
                support,
                doc_generation,
                nav_authorised,
            }}>
            {children}
        </WorldSessionContext.Provider>
    );
};

export const useWorldSession = () => {
    const context = useContext(WorldSessionContext);
    if (!context) {
        throw new Error(
            "useWorldSession must be used within a WorldSessionProvider"
        );
    }
    return context;
};

export const MockWorldSessionProvider = ({
    children,
    id = 1,
    url = "https://example.com",
    tab_dimensions = { width: 800, height: 600 },
    support = null,
    doc_generation = 0,
    nav_authorised = true,
}: {
    children: React.ReactNode;
    id?: number;
    url?: string;
    tab_dimensions?: { width: number; height: number };
    support?: SupportMeta | null;
    doc_generation?: number;
    nav_authorised?: boolean;
}) => {
    return (
        <WorldSessionContext.Provider
            value={{
                id,
                url,
                tab_dimensions,
                support,
                doc_generation,
                nav_authorised,
            }}>
            {children}
        </WorldSessionContext.Provider>
    );
};
