import { Container, Text } from "@react-three/uikit";
import { Maximize2, Minimize2, Settings } from "@react-three/uikit-lucide";
import { ReactNode, useCallback, useEffect, useMemo } from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { DoubleSide, MeshBasicMaterial } from "three";
import { configureTextBuilder } from "troika-three-text";



import { Crossfader, useCrossfadeOpacity } from "./animation/Crossfader";
import { FocusableButton } from "./components/FocusableButton";
import { FocusNavProvider } from "./contexts/FocusNavContext";
import { NavStateProvider, useNavState } from "./contexts/NavStateContext";
import { Header } from "./layout/Header";
import type { ScreenName } from "./screens";
import { screens } from "./screens";


export {dispatch_ui_nav} from "./contexts/FocusNavContext";


// its not happy! turn off web workers
configureTextBuilder({
    useWorker: false
});

export const WATCH_UI_WIDTH = 900;
export const WATCH_UI_HEIGHT = 600;

class DoubleSidedSolidPanel extends MeshBasicMaterial {
    constructor() {
        super({
            side: DoubleSide,
            transparent: true,
            depthWrite: false
        });
    }
}

const EndButtons = ({ current, change_screen }: { current: ScreenName | null, change_screen: (screen_name: ScreenName) => void }) => {
    const {detachable, detached, set_detach} = useNavState();
    const opacity = useCrossfadeOpacity();

    return (
        <>
            {current === "home" && (
                <FocusableButton variant="link" color="white" on_press={() => change_screen("settings")} opacity={opacity}>
                    <Settings />
                </FocusableButton>
            )}

            {detachable && (
                <FocusableButton variant="link" color="white" on_press={() => set_detach && set_detach(!detached)} opacity={opacity}>
                    {detached ? <Minimize2 /> : <Maximize2 />}
                </FocusableButton>
            )}
        </>
    );
}

const WatchErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
    useEffect(() => {
        console.error("Error in watch UI:", error);
    }, []);
    
    return (
        <Container width="100%" height="100%" flexDirection="column" alignItems="center" justifyContent="center" gap={16} backgroundColor="#ff0000">
            <Text fontSize={24} fontWeight="bold" color="white">Doh!</Text>
            <Text fontSize={16} color="white">Something went wrong with this page.</Text>

            <FocusableButton variant="link" color="white" on_press={resetErrorBoundary} marginTop={16}>
                <Text fontSize={16} color="white">Go home</Text>
            </FocusableButton>
        </Container>
    );
}

const CurrentScreen = () => {
    const state = useNavState();
    const { current, current_args, change_screen } = state;

    const ScreenContent = useMemo(() => {
        if (!current) return () => null;
        const screen = screens[current];
        if (!screen) return () => null;
        return screen;
    }, [current]);

    const content_key = useMemo(() => {
        if (!current) return "none";
        return `${current}-${JSON.stringify(current_args)}`;
    }, [current, current_args]);

    return (
        <Container width="100%" maxWidth="100%" height="100%" flexDirection="column" gap={12}>
            <Header nav_state={state} end_buttons={<EndButtons current={current} change_screen={change_screen} />} />

            <Container
                width="100%"
                flexGrow={1}
                minHeight={0}
                overflow="scroll"
                scrollbarWidth={6}
                scrollbarColor="rgba(255, 255, 255, 0.35)"
                scrollbarBorderRadius={3}
            >
                <Crossfader content_key={content_key} width="100%" flexShrink={0}>
                    <ErrorBoundary FallbackComponent={WatchErrorFallback} onReset={() => {
                        change_screen("home");
                    }}>
                        <Container width="100%" maxWidth="100%" flexDirection="column" gap={16}>
                            <ScreenContent args={current_args} />
                        </Container>
                    </ErrorBoundary>
                </Crossfader>
            </Container>
        </Container>
    );
}

const FocusNavBridge = ({
    children,
    on_request_close
}: {
    children: ReactNode;
    on_request_close?: () => void;
}) => {
    const { backwards, back } = useNavState();

    // cancel walks the screen stack first, at the root it closes the watch
    const on_back = useCallback(() => {
        if (backwards.length > 0) {
            back();
        } else {
            on_request_close?.();
        }
    }, [backwards.length, back, on_request_close]);

    return <FocusNavProvider on_back={on_back}>{children}</FocusNavProvider>;
};

export const WatchUI = ({on_request_close, set_detach, detached, detachable}: {on_request_close?: () => void, set_detach?: (detached: boolean) => void, detached?: boolean, detachable?: boolean}) => {
    return (
        <Container
            width={WATCH_UI_WIDTH}
            height={WATCH_UI_HEIGHT}
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            backgroundColor="#547299"
            opacity={0.85}
            padding={16}
            borderRadius={16}
            panelMaterialClass={DoubleSidedSolidPanel}

            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            <NavStateProvider options={{detached, detachable, set_detach}}>
                <FocusNavBridge on_request_close={on_request_close}>
                    <CurrentScreen />
                </FocusNavBridge>
            </NavStateProvider>
        </Container>
    );
};

// TODO: add ui debounce to prevent double pointer on pushing too far through watch? or just global Z check?
