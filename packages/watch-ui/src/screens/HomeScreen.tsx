import {
    useServiceURLs,
    useStorage,
    useWorldSession
} from "@hyperlinkvr/react";
import { FeaturedWorlds, FeaturedWorldsSchema } from "@hyperlinkvr/vr-engine-schemas";
import { Container, Text } from "@react-three/uikit";
import { useEffect, useState } from "react";



import { HorizontalRule } from "../components/HorizontalRule";
import { SearchBarUI } from "../components/SearchBarUI";
import { WorldCarousel } from "../components/WorldCarousel";
import { WorldFavouriteButton } from "../components/WorldFavouriteButton";
import { useNavState } from "../contexts/NavStateContext";
import { ScreenProps } from "./index";


export const HomeScreen = ({}: ScreenProps) => {
    const session = useWorldSession();

    const {change_screen, current} = useNavState();

    const [featured_worlds, setFeaturedWorlds] = useState<FeaturedWorlds | null>(null);
    const [loading_featured_worlds, setLoadingFeaturedWorlds] = useState(true);
    const {featured} = useServiceURLs();
    useEffect(() => {
        if (current !== "home") {
            return;
        }

        setLoadingFeaturedWorlds(true);
        fetch(featured).then(res => res.json()).then(data => {
            setFeaturedWorlds(FeaturedWorldsSchema.parse(data));
            setLoadingFeaturedWorlds(false);
        }).catch(err => {
            console.error("Failed to fetch featured worlds:", err);
            setLoadingFeaturedWorlds(false);
        });
    }, [featured]);

    const [favourite_worlds] = useStorage("sync", "favourite_worlds", [] as string[]);
    const [_recent_worlds] = useStorage("local", "recent_worlds", [] as string[]);

    const [search_mode, setSearchMode] = useState(false);

    return (
        <Container width="100%" height="100%" flexDirection="column" alignItems="center" justifyContent="flex-start" gap={16} padding={16} overflow="scroll">
            <Container
                display={search_mode ? "none" : "flex"}
                flexShrink={0}
                flexDirection="column"
                alignItems="flex-start"
                justifyContent="flex-start"
                gap={8}
                width="100%"
            >
                <Container height={50} width="100%" flexDirection="row" alignItems="center" gap={8} marginBottom={16} backgroundColor="#ffffff" padding={12} borderRadius={6} flexShrink={0}>
                    <Text fontWeight="bold">Current world:</Text>
                    <Text>{session.url}</Text>

                    <WorldFavouriteButton url={session.url || undefined} color="black" marginLeft="auto" />
                </Container>

                <HorizontalRule />
            </Container>

            <SearchBarUI search_mode={search_mode} set_search_mode={setSearchMode} />

            <Container display={search_mode ? "none" : "flex"} flexDirection="column" alignItems="flex-start" justifyContent="flex-start" gap={16} width="100%">
                {favourite_worlds.length > 0 && (
                    <WorldCarousel worlds={favourite_worlds} title="Favourite worlds" on_select={(url) => {
                        change_screen("world", {url});
                    }} />
                )}

                {loading_featured_worlds && <Text color="white">Loading featured worlds...</Text>}
                {!loading_featured_worlds && featured_worlds && featured_worlds.rows.map((row => (
                    <WorldCarousel worlds={row.worlds} title={row.title} on_select={(url) => {
                        change_screen("world", {url});
                    }} />
                )))}
                {!loading_featured_worlds && !featured_worlds && <Text color="white">Failed to load featured worlds.</Text>}
            </Container>
        </Container>
    );
};

// TODO: carousels of favourite worlds and recent worlds, with buttons to launch them, as well as some cached image somewhere

// TODO: base screen component that defines padding and titlebar with backstack and custom buttons
