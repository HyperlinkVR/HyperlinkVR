import { Container, Svg, Text } from "@react-three/uikit";
import { useStorage, useWorldSession } from "@hyperlinkvr/react";

import type { ScreenProps } from "./index";
import { Star } from "@react-three/uikit-lucide";
import { useMemo } from "react";
import {Crossfader, useCrossfadeOpacity} from "../animation/Crossfader";
import {FocusableButton} from "../components/FocusableButton";

const star_filled_url = new URL("../assets/lucide_star_filled.svg", import.meta.url).href;
const StarFilled = () => (
    <Svg src={star_filled_url} width={24} height={24}  />
);

export const HomeScreen = ({}: ScreenProps) => {
    const session = useWorldSession();

    const [favourite_worlds, setFavouriteWorlds] = useStorage("sync", "favourite_worlds", [] as string[]);
    const is_world_favourite = useMemo(() => {
        if (!session.url) return false;
        return favourite_worlds.includes(session.url);
    }, [favourite_worlds, session.url]);


    const [_recent_worlds] = useStorage("local", "recent_worlds", [] as string[]);

    const opacity = useCrossfadeOpacity();

    return (
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
    );
};

// TODO: carousels of favourite worlds and recent worlds, with buttons to launch them, as well as some cached image somewhere

// TODO: base screen component that defines padding and titlebar with backstack and custom buttons
