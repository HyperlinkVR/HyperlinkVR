import { useServiceURLs, useStorage, useWorldSession } from "@hyperlinkvr/react";
import { FeaturedWorlds, FeaturedWorldsSchema } from "@hyperlinkvr/vr-engine-schemas";
import { Container, Svg, Text } from "@react-three/uikit";
import { Star } from "@react-three/uikit-lucide";
import { useEffect, useMemo, useState } from "react";



import { Crossfader, useCrossfadeOpacity } from "../animation/Crossfader";
import { FocusableButton } from "../components/FocusableButton";
import { WorldCarousel } from "../components/WorldCarousel";
import { useNavState } from "../contexts/NavStateContext";
import type { ScreenProps } from "./index";


const star_filled_url = new URL("../assets/lucide_star_filled.svg", import.meta.url).href;
const StarFilled = () => (
    <Svg src={star_filled_url} width={24} height={24}  />
);

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

    const [favourite_worlds, setFavouriteWorlds] = useStorage("sync", "favourite_worlds", [] as string[]);
    const is_world_favourite = useMemo(() => {
        if (!session.url) return false;
        return favourite_worlds.includes(session.url);
    }, [favourite_worlds, session.url]);


    const [_recent_worlds] = useStorage("local", "recent_worlds", [] as string[]);

    const opacity = useCrossfadeOpacity();

    return (
        <>
            <Container width="100%" flexDirection="row" alignItems="center" gap={8} marginBottom={16} backgroundColor="#ffffff" padding={12} borderRadius={6}>
                <Text fontWeight="bold">Current world:</Text>
                <Text>{session.url}</Text>

                <FocusableButton opacity={opacity} variant="link" color="black" marginLeft="auto" on_press={() => {
                    if (!session.url) return;
                    if (is_world_favourite) {
                        setFavouriteWorlds(favourite_worlds.filter(url => url !== session.url));
                    } else {
                        setFavouriteWorlds([...favourite_worlds, session.url]);
                    }
                }}>
                    <Crossfader content_key={is_world_favourite ? "favourite" : "not_favourite"} duration={100}>
                        {is_world_favourite ? <StarFilled /> : <Star />}
                    </Crossfader>
                </FocusableButton>
            </Container>

            {loading_featured_worlds && <Text color="white">Loading featured worlds...</Text>}
            {!loading_featured_worlds && featured_worlds && featured_worlds.rows.map((row => (
                <WorldCarousel worlds={row.worlds} title={row.title} on_select={(url) => {
                    change_screen("world", {url});
                }} />
            )))}
            {!loading_featured_worlds && !featured_worlds && <Text color="white">Failed to load featured worlds.</Text>}

            <WorldCarousel worlds={favourite_worlds} title="Favourite worlds" on_select={(url) => {
                change_screen("world", {url});
            }} />
        </>
    );
};

// TODO: carousels of favourite worlds and recent worlds, with buttons to launch them, as well as some cached image somewhere

// TODO: base screen component that defines padding and titlebar with backstack and custom buttons
