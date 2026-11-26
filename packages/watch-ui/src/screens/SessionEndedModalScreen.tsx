import { Container, Text } from "@react-three/uikit";
import { useCallback } from "react";

import { useCrossfadeOpacity } from "../animation/Crossfader";
import { FocusableButton } from "../components/FocusableButton";
import { useNavState } from "../contexts/NavStateContext";
import type { ScreenProps } from "./index";

const TEXTS: Record<string, { title: string; body: string }> = {
    "host-left": {
        title: "The host left",
        body: "The host of this world has left, and the session has ended. You can stay here, but the world may not function correctly. You can also browse for another world to join."
    },
    "connection-lost": {
        title: "Connection lost",
        body: "You were disconnected from this world's session. You can stay here, but the world may not function correctly. You can also browse for another world to join."
    }
};

// shown when a shared session ends under the player. there's no host migration yet, so the
// instance just ends: they can stay in the frozen world, or browse for somewhere else to go.
export const SessionEndedModalScreen = ({ args }: ScreenProps) => {
    const { resolve_modal, back, change_screen } = useNavState();
    const opacity = useCrossfadeOpacity();

    const text = TEXTS[typeof args.reason === "string" ? args.reason : ""] ?? TEXTS["connection-lost"]!;

    const handle_stay = useCallback(() => {
        resolve_modal("stay");
        back();
    }, [resolve_modal, back]);

    // switching screen settles the modal with its dismiss value and keeps the watch open
    const handle_browse = useCallback(() => {
        change_screen("home");
        // TODO: navigate to home page without adding to backstack so they dont back to modal
    }, [change_screen]);

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
                <Text fontSize={28} fontWeight="bold" color="white">
                    {text.title}
                </Text>

                <Text fontSize={18} color="rgba(255, 255, 255, 0.85)">
                    {text.body}
                </Text>
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
                    on_press={handle_stay}>
                    <Text fontWeight="bold" color="white" fontSize={24}>
                        Stay here
                    </Text>
                </FocusableButton>

                <FocusableButton
                    flexGrow={1}
                    height="100%"
                    backgroundColor="#2e8555"
                    opacity={opacity}
                    on_press={handle_browse}>
                    <Text fontWeight="bold" color="white" fontSize={24}>
                        Find another world
                    </Text>
                </FocusableButton>
            </Container>
        </Container>
    );
};
