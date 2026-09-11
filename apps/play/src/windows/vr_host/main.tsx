import "@hyperlinkvr/vr-engine/dev-hook";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";

import "../../shared.css";

import { LoadingSpinner, ProfilePicture} from "@hyperlinkvr/ui-dom";
import { EngineHost, xr_store } from "@hyperlinkvr/vr-engine";

import { DefaultContextProviders } from "../../contexts/DefaultContextProviders";
import {NetworkEngineProvider, useAuthSession, useSetting} from "@hyperlinkvr/react";
import {LocalNetworkEngine} from "@hyperlinkvr/platform-browser";

type LoadPhase = "idle" | "starting" | "started";

// TODO: service mode, resolving the multiplayer service's carrier
const DevNetworkEngineProvider = ({children}: {children: React.ReactNode}) => {
    const [mode] = useSetting("devtools_network_mode");
    const [latency_ms] = useSetting("devtools_network_latency");
    const [jitter_ms] = useSetting("devtools_network_jitter");
    const [drop_percent] = useSetting("devtools_network_drop");

    const engine = useMemo(() => (mode === "local" ? new LocalNetworkEngine() : null), [mode]);

    useEffect(() => {
        engine?.set_conditions({latency_ms, jitter_ms, drop_rate: drop_percent / 100});
    }, [engine, latency_ms, jitter_ms, drop_percent]);

    return <NetworkEngineProvider engine={engine}>{children}</NetworkEngineProvider>;
};

// TODO: rename page to engine or host

const LoginHint = () => {
    const auth_session = useAuthSession();

    return (
        <div className="absolute top-4 right-4 text-sm text-gray-400 flex items-center gap-2">
            <span>Logged in as <span className="font-semibold">{auth_session ? auth_session.username : "Guest"}</span></span>
            <ProfilePicture username={auth_session?.username} avatar_url={auth_session?.avatar_url} className="w-6 h-6" />
        </div>
    );
}

const SpectatorUI = () => {
    const starting_ref = useRef(false);
    const [phase, setPhase] = useState<LoadPhase>("idle");

    const [is_supported, setIsSupported] = useState<boolean | null>(false);

    const [on_ready, setXRReady] = useState(false);
    const handle_xr_ready = useCallback(() => setXRReady(true), []);

    const enter_vr = useCallback(() => {
        if (starting_ref.current || !on_ready) return;

        starting_ref.current = true; // guard against double-entry
        xr_store
            .enterVR()
            .then(() => setPhase("started"))
            .catch((err) => {
                console.error(err);
                starting_ref.current = false; // allow retry on failure
                setPhase("idle");
            });

        setPhase("starting");
    }, [on_ready]);

    useEffect(() => {
        const check_support = async () => {
            if (!navigator.xr) {
                setIsSupported(null);
                return;
            }

            const supported =
                await navigator.xr.isSessionSupported("immersive-vr");
            setIsSupported(supported);
        };

        check_support();

        const handle_device_change = async () => {
            const supported =
                await navigator.xr?.isSessionSupported("immersive-vr");
            setIsSupported(supported || false);
        };

        navigator.xr?.addEventListener("devicechange", handle_device_change);

        return () => {
            navigator.xr?.removeEventListener(
                "devicechange",
                handle_device_change
            );
        };
    }, []);

    const [mode, setMode] = useState<"vr" | "flat">("vr");

    const play_flat = useCallback(() => {
        setMode("flat");
        setPhase("started");
    }, []);

    if (is_supported === null) {
        return (
            <div className="bg-black/80 backdrop-blur-md absolute inset-0 flex flex-col items-center justify-center z-50 text-white gap-8">
                <h1 className="font-title text-3xl">HyperlinkVR</h1>
                <p className="text-lg">
                    WebXR is not supported in this browser.
                </p>
            </div>
        );
    }

    const button_text = is_supported ? (
        phase === "starting" ? (
            <LoadingSpinner className="mx-auto" />
        ) : (
            "Enter VR"
        )
    ) : (
        "No VR device detected!"
    );

    return (
        <DefaultContextProviders>
            <main className="font-sans">
                {phase !== "started" && (
                    <div className="bg-black/80 backdrop-blur-md absolute inset-0 flex flex-col items-center justify-center z-50 text-white gap-8">
                        <LoginHint />

                        <h1 className="font-title text-3xl">HyperlinkVR</h1>

                        <div className="flex flex-col gap-4 w-64 items-center justify-center">
                            {on_ready ? (
                                // TODO: we really need a button component
                                <button
                                    className="w-full px-4 py-2 bg-blue-600 rounded-lg hover:not-disabled:bg-blue-700 transition text-xl font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
                                    onClick={enter_vr}
                                    disabled={
                                        !is_supported || phase === "starting"
                                    }>
                                    {button_text}
                                </button>
                            ) : (
                                <LoadingSpinner className="my-2" />
                            )}

                            <button
                                className="w-full px-4 py-2 bg-blue-600 rounded-lg hover:not-disabled:bg-blue-700 transition text-xl font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
                                onClick={play_flat}
                                disabled={phase === "starting" || mode === "flat"}
                            >
                                Play in flat mode
                            </button>
                        </div>
                    </div>
                )}
                <div className="h-screen w-screen bg-black flex items-center justify-center">
                    <DevNetworkEngineProvider>
                        <EngineHost mode={mode} on_xr_ready={handle_xr_ready} />
                    </DevNetworkEngineProvider>
                </div>
            </main>
        </DefaultContextProviders>
    );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<SpectatorUI />);

// TODO: button to enter flat mode
