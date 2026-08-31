import type { EventMessage } from "@hyperlinkvr/types";
import {
    WorldMetadata,
    WorldMetadataInput,
    WorldMetadataSchema
} from "@hyperlinkvr/vr-engine-schemas";
import { createContext, useContext, useEffect, useState } from "react";



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
    world_metadata = {
        version: 1,
        title: "Mock World",
        description: "Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.",
        category: "utility",
        tags: [
            "fake",
            "test"
        ],
        author: {
            username: "ollie@hyperlink.surf",
            signature: "4iiM/d0XS6Lx4qG07/knLmxoi79/uDFdKBMMKz27IfvhjYnnZc4KAg6Eg+PPqLHzGC7apxggRKC9fHvlj8EpCg=="
        },
        additional_contributors: [
            {
                username: "johndoe@example.com",
                role: "contributor"
            }
        ],
        thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Cat_August_2010-4.jpg/500px-Cat_August_2010-4.jpg",
        gallery: [
            "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Cat_August_2010-4.jpg/500px-Cat_August_2010-4.jpg",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Cat_August_2010-4.jpg/500px-Cat_August_2010-4.jpg",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Cat_August_2010-4.jpg/500px-Cat_August_2010-4.jpg"
        ],
        theme_color: 16711935,
        supports: {
            vr: "yes",
            flat: "no",
            low_power: "maybe",
            teleport: true
        },
        languages: [
            "en",
            "zh"
        ],
        max_players: 32,
        recommended_players: 8,
        content_flags: [
            "drugs"
        ],
        vr_comfort: "intense",
        preloads: [
            "https://example.com/image.png"
        ],
        endorsements: [
            "https://hyperlink.surf/minigolf"
        ]
    }
}: {
    children: React.ReactNode;
    id?: number;
    url?: string;
    tab_dimensions?: { width: number; height: number };
    support?: SupportMeta | null;
    doc_generation?: number;
    world_metadata?: WorldMetadataInput | null;
}) => {
    return (
        <WorldSessionContext.Provider
            value={{
                id,
                url,
                tab_dimensions,
                support,
                doc_generation,
                world_metadata: WorldMetadataSchema.parse(world_metadata),
            }}>
            {children}
        </WorldSessionContext.Provider>
    );
};
