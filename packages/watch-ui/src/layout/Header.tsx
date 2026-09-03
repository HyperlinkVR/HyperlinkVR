import {ArrowLeft} from "@react-three/uikit-lucide";
import {Container, Text} from "@react-three/uikit";
import {Button} from "@react-three/uikit-default";
import {Crossfader, useCrossfadeOpacity} from "../animation/Crossfader";
import type {useNavState} from "../contexts/NavStateContext";

interface HeaderProps {
    nav_state: ReturnType<typeof useNavState>;
    end_buttons?: React.ReactNode;
}

const BackButton = ({nav_state}: {nav_state: ReturnType<typeof useNavState>}) => {
    const opacity = useCrossfadeOpacity();

    const {backwards, back, name_to_title} = nav_state;
    return (
        backwards.length !== 0 && (
            <Button variant="link" color="white" onPointerDown={back} opacity={opacity} gap={16}>
                <ArrowLeft />
                <Text color={0xdddddd} fontSize={16}>{name_to_title(backwards[backwards.length - 1]!.name)}</Text>
            </Button>
        )
    );
}

export const Header = ({nav_state, end_buttons = null}: HeaderProps) => {
    if (!nav_state) {
        return null;
    }

    const {current, backwards, current_title} = nav_state;

    return (
        <Container height="10%" width="100%" flexDirection="row" alignItems="center" justifyContent="space-between">
            <Crossfader content_key={backwards.length} width="25%" height="100%" alignItems="center" justifyContent="flex-start">
                <BackButton nav_state={nav_state} />
            </Crossfader>

            <Crossfader content_key={current || "none"} width="50%" height="100%" alignItems="center" justifyContent="center">
                <Text color="white" fontSize={32} fontWeight="bold">
                    {current_title}
                </Text>
            </Crossfader>

            <Crossfader content_key={current || "none"} width="25%" height="100%" flexShrink={0} alignItems="center" justifyContent="flex-end">
                {end_buttons}
            </Crossfader>
        </Container>
    );
}
