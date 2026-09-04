import { useStorage } from "@hyperlinkvr/react";
import { Svg } from "@react-three/uikit";
import { Star } from "@react-three/uikit-lucide";
import { useMemo } from "react";



import { Crossfader, useCrossfadeOpacity } from "../animation/Crossfader";
import { FocusableButton } from "./FocusableButton";


const star_filled_url = new URL("../assets/lucide_star_filled.svg", import.meta.url).href;
const StarFilled = () => (
    <Svg src={star_filled_url} width={24} height={24}  />
);

interface WorldFavouriteButtonProps extends React.ComponentProps<typeof FocusableButton> {
    url?: string;
}

export const WorldFavouriteButton = ({ url, ...rest }: WorldFavouriteButtonProps) => {
    const opacity = useCrossfadeOpacity();

    const [favourite_worlds, setFavouriteWorlds] = useStorage("sync", "favourite_worlds", [] as string[]);
    const is_world_favourite = useMemo(() => {
        if (!url) return false;
        return favourite_worlds.includes(url);
    }, [favourite_worlds, url]);

    return (
        <FocusableButton opacity={opacity} variant="link" {...rest} on_press={() => {
            if (!url) return;
            if (is_world_favourite) {
                setFavouriteWorlds(favourite_worlds.filter(fav_url => fav_url !== url));
            } else {
                setFavouriteWorlds([...favourite_worlds, url]);
            }
        }}>
            <Crossfader content_key={is_world_favourite ? "favourite" : "not_favourite"} duration={100}>
                {is_world_favourite ? <StarFilled /> : <Star />}
            </Crossfader>
        </FocusableButton>
    );
}
