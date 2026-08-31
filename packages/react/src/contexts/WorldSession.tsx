import { createContext, useContext, useEffect, useState } from "react";
import { useMessageEngine } from "./engines";
import { useWindowArguments } from "./windowing";
import type { EventMessage } from "@hyperlinkvr/types";
import type { WorldMetadata } from "@hyperlinkvr/vr-engine-schemas";

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

    world_metadata: WorldMetadata | null;
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
    const [world_metadata, setWorldMetadata] = useState<WorldMetadata | null>(null);

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
                setTabDimensions({ width: msg.width, height: msg.height });
            }

            if (msg.type === "HVR_META_UPDATE") {
                setSupport(msg.content);
                // a replay is the background re-sending the cached meta to a
                // newly connected window (hydration). the meta value still needs
                // to update, but it is not a new document, so don't bump the
                // generation - otherwise it would clobber a world env the game
                // already customised (see WorldEnvironment reset effect).
                if (!msg.replay) {
                    setDocGeneration((previous) => previous + 1);
                }
            }
        });

        return () => {
            unlisten();
            channel.disconnect();
        };
    }, [messenger, tab]);

    useEffect(() => {
        // when url changes, try to fetch the world metadata (located at worldurl/hvr-world.json, if world url is a file like index.html then same dir)
        if (url) {
            const world_metadata_url = new URL("hvr-world.json", url).toString();
            fetch(world_metadata_url)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch world metadata: ${response.statusText}`);
                    }
                    return response.json();
                })
                .then((data: WorldMetadata) => {
                    console.log("Fetched world metadata:", data);
                    setWorldMetadata(data);
                })
                .catch((error) => {
                    console.error("Error fetching world metadata:", error);
                    setWorldMetadata(null);
                });
        }
    }, [url]);

    return (
        <WorldSessionContext.Provider
            value={{
                id: tab,
                url,
                tab_dimensions,
                support,
                doc_generation,
                world_metadata
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
    world_metadata = null
}: {
    children: React.ReactNode;
    id?: number;
    url?: string;
    tab_dimensions?: { width: number; height: number };
    support?: SupportMeta | null;
    doc_generation?: number;
    world_metadata?: WorldMetadata | null;
}) => {
    return (
        <WorldSessionContext.Provider
            value={{
                id,
                url,
                tab_dimensions,
                support,
                doc_generation,
                world_metadata
            }}>
            {children}
        </WorldSessionContext.Provider>
    );
};
