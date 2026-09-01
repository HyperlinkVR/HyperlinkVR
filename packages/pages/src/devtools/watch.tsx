import { MockWorldSessionProvider, SessionModeProvider } from "@hyperlinkvr/react";
import { WATCH_UI_HEIGHT, WATCH_UI_WIDTH, WatchUI } from "@hyperlinkvr/watch-ui";
import { Canvas } from "@react-three/fiber";
import { Container, Fullscreen } from "@react-three/uikit";
import { useState } from "react";


export const DevToolsWatchPage = () => {
    const [mode, setMode] = useState<"vr" | "flat">("flat");

    return (
        <main className="w-full h-screen flex flex-col gap-4 p-2">
            <label>
                Emulated mode:
                <select onChange={(e) => setMode(e.target.value as "vr" | "flat")} value={mode}>
                    <option value="flat">Flat</option>
                    <option value="vr">VR</option>
                </select>
            </label>

            <SessionModeProvider value={mode}>
                <MockWorldSessionProvider>
                    <div className="w-full h-full flex items-center justify-center">
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
                    </div>
                </MockWorldSessionProvider>
            </SessionModeProvider>
        </main>
    );
};
