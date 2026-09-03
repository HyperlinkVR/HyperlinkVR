import {
    WorldMetadata,
    WorldMetadataInput,
    WorldMetadataSchema
} from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useState } from "react";





export const useWorldMetadata = (world_url: string | null) => {
    const [world_metadata, setWorldMetadata] = useState<WorldMetadata | null>(null);

    useEffect(() => {
        // when url changes, try to fetch the world metadata (located at worldurl/hvr-world.json, if world url is a file like index.html then same dir)
        if (world_url) {
            const world_metadata_url = new URL("hvr-world.json", world_url).toString();

            fetch(world_metadata_url)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(
                            `Failed to fetch world metadata: ${response.statusText}`
                        );
                    }
                    return response.json();
                })
                .then((input_data: WorldMetadata) => {
                    const {data, success} = WorldMetadataSchema.safeParse(input_data);
                    if (!success) {
                        console.error("Invalid world metadata:", data);
                        setWorldMetadata(null);
                        return;
                    }
                    setWorldMetadata(data);
                })
                .catch((error) => {
                    console.error("Error fetching world metadata:", error);
                    setWorldMetadata(null);
                });
        } else {
            setWorldMetadata(null);
        }
    }, [world_url]);

    return world_metadata;
};


const WORLD_METADATA_FALLBACK_DEFAULT = WorldMetadataSchema.parse({
    version: 1,
    title: "Unknown World",
} satisfies WorldMetadataInput);

export const useWorldMetadataWithFallback = (world_url: string | null, fallback: WorldMetadata = WORLD_METADATA_FALLBACK_DEFAULT) => {
    const world_metadata = useWorldMetadata(world_url);

    if (world_metadata) {
        return world_metadata;
    }

    return fallback;
};
