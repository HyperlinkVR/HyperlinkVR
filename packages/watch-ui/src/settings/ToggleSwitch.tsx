import { Label, Switch } from "@react-three/uikit-default";
import { Container, Text } from "@react-three/uikit";
import {useCrossfadeOpacity} from "../animation/Crossfader";
import {useFocusable} from "../contexts/FocusNavContext";
import type {ComponentRef} from "react";
import { useRef} from "react";

export const ToggleSwitch = ({value, on_change, label}: {value: boolean; on_change: (value: boolean) => void; label: string}) => {
    const ref = useRef<ComponentRef<typeof Container>>(null);
    const {is_focused} = useFocusable(ref, {
        on_accept: () => on_change(!value)
    });

    const opacity = useCrossfadeOpacity();

    return (
        <Container
            ref={ref}
            onPointerDown={() => on_change(!value)}
            flexDirection="row"
            alignItems="center"
            gap={8}
            opacity={opacity}
        >
            <Label>
                <Text>{label}</Text>
            </Label>

            <Switch checked={value} borderWidth={is_focused ? 1 : 0} borderColor={is_focused ? "white" : "transparent"} />
        </Container>
    );
}
