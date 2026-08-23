import { createContext, useContext, useEffect, useState } from "react";
import { useMessageEngine } from "./engines";
import { useWindowArguments } from "./windowing";
import type { EventMessage } from "@hyperlinkvr/types";

export type TabMeta = "supported" | "defer" | "disable";

export interface TabSessionContextValue {
    id: number;
    url: string | null;
    dimensions: {
        width: number;
        height: number;
    } | null;
    meta: TabMeta | null;
    // increments once per document (every HVR_META_UPDATE), even when the
    // meta value itself is unchanged. effect on this to reset world state.
    meta_generation: number;
}

const TabSessionContext = createContext<TabSessionContextValue | null>(null);

export const TabSessionProvider = ({children}: { children: React.ReactNode; }) => {
    const window_data = useWindowArguments();

    if (!window_data.tab) {
        throw new Error("TabSessionProvider must be used within a window with a tab argument");
    }

    const { tab: tab_str } = window_data;
    const tab = parseInt(tab_str, 10);

    const messenger = useMessageEngine();

    const [url, setUrl] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);
    const [meta, setMeta] = useState<TabMeta | null>(null);
    const [meta_generation, setMetaGeneration] = useState(0);

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
            }

            if (msg.type === "HVR_DIMENSIONS_UPDATE") {
                setDimensions({ width: msg.width, height: msg.height });
            }

            if (msg.type === "HVR_META_UPDATE") {
                setMeta(msg.content);
                // a replay is the background re-sending the cached meta to a
                // newly connected window (hydration). the meta value still needs
                // to update, but it is not a new document, so don't bump the
                // generation - otherwise it would clobber a world env the game
                // already customised (see WorldEnvironment reset effect).
                if (!msg.replay) {
                    setMetaGeneration((previous) => previous + 1);
                }
            }
        });

        return () => {
            unlisten();
            channel.disconnect();
        };
    }, [messenger, tab]);

    return (
        <TabSessionContext.Provider
            value={{
                id: tab,
                url,
                dimensions,
                meta,
                meta_generation
            }}>
            {children}
        </TabSessionContext.Provider>
    );
};

export const useTabSession = () => {
    const context = useContext(TabSessionContext);
    if (!context) {
        throw new Error(
            "useTabSession must be used within a TabSessionProvider"
        );
    }
    return context;
};

export const MockTabSessionProvider = ({
    children,
    id = 1,
    url = "https://example.com",
    dimensions = { width: 800, height: 600 },
    meta = null,
    meta_generation = 0
}: {
    children: React.ReactNode;
    id?: number;
    url?: string;
    dimensions?: { width: number; height: number };
    meta?: TabMeta | null;
    meta_generation?: number;
}) => {
    return (
        <TabSessionContext.Provider
            value={{
                id,
                url,
                dimensions,
                meta,
                meta_generation
            }}>
            {children}
        </TabSessionContext.Provider>
    );
};
