import { Canvas } from "@react-three/fiber";
import { Container, Fullscreen } from "@react-three/uikit";
import { MockWorldSessionProvider } from "@hyperlinkvr/react";
import { WATCH_UI_HEIGHT, WATCH_UI_WIDTH, WatchUI } from "@hyperlinkvr/watch-ui";

export const DevToolsWatchPage = () => {
    return (
        <MockWorldSessionProvider>
            <main className="w-screen h-screen flex items-center justify-center">
                <Canvas gl={{ localClippingEnabled: true }}>
                    <Fullscreen
                        flexDirection="column"
                        alignItems="center"
                        justifyContent="center">
                        <Container
                            width={WATCH_UI_WIDTH}
                            height={WATCH_UI_HEIGHT}
                            flexDirection="column">
                            <WatchUI />
                        </Container>
                    </Fullscreen>
                </Canvas>
            </main>
        </MockWorldSessionProvider>
    );
};
