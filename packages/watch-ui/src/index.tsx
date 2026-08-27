import { Container } from "@react-three/uikit";
import type {ReactNode} from "react";
import { useCallback, useMemo} from "react";
import { DoubleSide, MeshBasicMaterial } from "three";
import { configureTextBuilder } from "troika-three-text";



import type { ScreenName} from "./screens";
import { screens } from "./screens";
import {NavStateProvider, useNavState} from "./contexts/NavStateContext";
import {Crossfader, useCrossfadeOpacity} from "./animation/Crossfader";
import {Maximize2, Minimize2, Settings} from "@react-three/uikit-lucide";
import {Header} from "./layout/Header";
import {FocusNavProvider} from "./contexts/FocusNavContext";
import {FocusableButton} from "./components/FocusableButton";

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

const CurrentScreen = () => {
    const state = useNavState();
    const { current, change_screen } = state;

    const ScreenContent = useMemo(() => {
        if (!current) return () => null;
        const screen = screens[current];
        if (!screen) return () => null;
        return screen;
    }, [current]);

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
                <Crossfader content_key={current || "none"} width="100%" flexShrink={0}>
                    <Container width="100%" maxWidth="100%" flexDirection="column" gap={16}>
                        <ScreenContent />
                    </Container>
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
