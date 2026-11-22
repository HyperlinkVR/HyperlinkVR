import { Container, Text } from "@react-three/uikit";
import { useCallback } from "react";

import { useCrossfadeOpacity } from "../animation/Crossfader";
import { FocusableButton } from "../components/FocusableButton";
import { useNavState } from "../contexts/NavStateContext";
import type { ScreenProps } from "./index";

export const WorldNavigateModalScreen = ({ args }: ScreenProps) => {
    const { resolve_modal, back } = useNavState();
    const opacity = useCrossfadeOpacity();

    const target_url = typeof args.url === "string" ? args.url : undefined;

    const handle_confirm = useCallback(() => {
        resolve_modal(true);
        back();
    }, [resolve_modal, back]);

    const handle_cancel = useCallback(() => {
        resolve_modal(false);
        back();
    }, [resolve_modal, back]);

    return (
        <Container
            width="100%"
            height="100%"
            flexDirection="column"
            alignItems="center"
            justifyContent="space-between"
            gap={16}
            padding={16}
            color="white"
        >
            <Container
                width="100%"
                flexDirection="column"
                alignItems="flex-start"
                justifyContent="flex-start"
                gap={12}
            >
                <Text fontSize={24} color="white">
                    The current world wants to send you to another world.
                </Text>

                <Text fontSize={16} color="rgba(255, 255, 255, 0.8)">
                    Destination URL:
                </Text>

                <Container
                    width="100%"
                    padding={12}
                    backgroundColor="rgba(0, 0, 0, 0.25)"
                    borderRadius={8}>
                    <Text fontSize={16} color="white">
                        {target_url || "No URL provided."}
                    </Text>
                </Container>
            </Container>

            <Container
                marginTop="auto"
                width="100%"
                height="20%"
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
                gap={16}>
                <FocusableButton
                    flexGrow={1}
                    height="100%"
                    backgroundColor="#3a4a5e"
                    opacity={opacity}
                    on_press={handle_cancel}>
                    <Text fontWeight="bold" color="white" fontSize={24}>
                        Cancel
                    </Text>
                </FocusableButton>

                <FocusableButton
                    flexGrow={1}
                    height="100%"
                    backgroundColor="#2e8555"
                    opacity={opacity}
                    on_press={handle_confirm}>
                    <Text fontWeight="bold" color="white" fontSize={24}>
                        Confirm
                    </Text>
                </FocusableButton>
            </Container>
        </Container>
    );
};
