import { TabSessionProvider, useSetting, useStorage, useTabSession } from "@hyperlinkvr/react";
import { SoftShadows, Stats, Text } from "@react-three/drei";
import type { RootState } from "@react-three/fiber";
import { Canvas } from "@react-three/fiber";
import type { DefaultGLProps } from "@react-three/fiber/dist/declarations/src/core/renderer";
import { Physics, useFilterContactPair } from "@react-three/rapier";
import { createXRStore, XR } from "@react-three/xr";
import { QuarksProvider } from "quarks.r3f";
import { memo, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { ErrorBoundary, getErrorMessage, type FallbackProps } from "react-error-boundary";
import type {
    Group} from "three";
import {
    ACESFilmicToneMapping,
    HalfFloatType,
    Mesh,
    MeshBasicMaterial,
    WebGLRenderer
} from "three";
import { configureTextBuilder } from "troika-three-text";



import { AnimationRunner } from "../animation/AnimationRunner";
import { AnimationSync } from "../animation/AnimationSync";
import { TweenRunner } from "../animation/TweenRunner";
import { DOMMirror } from "../browser/DOMMirror";
import { URLBar } from "../browser/URLBar";
import { AvatarProvider, PlayerOriginProvider, useWebSDKMessaging } from "../contexts";
import { AudioListenerProvider } from "../contexts/AudioListenerContext";
import { SessionModeProvider } from "../contexts/SessionModeContext";
import { WebSDKMessagingProvider } from "../contexts/WebSDKMessagingContext";
import { SceneDebug } from "../debug/SceneDebug";
import { HUDSync } from "../hud/HUDSync";
import { HandsProvider } from "../input/hands";
import { FlatInputProvider } from "../input/impl/flat/bindings";
import { Crosshair } from "../input/impl/flat/Crosshair";
import { FlatClickRaycaster } from "../input/impl/flat/FlatClickRaycaster";
import { AutoHintGlyphs, HintDevicePublisher, HintStateProvider } from "../input/impl/flat/hints";
import { SpectatorCamera } from "../misc";
import { LogoOverlay } from "../misc/LogoOverlay";
import { InputMonitorRunner } from "../monitors/InputMonitorRunner";
import { ObjectMonitorRunner } from "../monitors/ObjectMonitorRunner";
import { clear_collider_collision_info, filter_contact_pair } from "../physics/collision_hooks";
import { FlatAvatarHands, XRAvatarHand } from "../player/AvatarHand";
import { Player } from "../player/Player";
import { AvatarMirror } from "../prefabs/AvatarMirror";
import { SceneRenderPass } from "../render/BasePasses";
import { CameraSetup } from "../render/CameraSetup";
import { CanvasResizer } from "../render/CanvasResizer";
import { GraphicsPipeline } from "../render/GraphicsPipeline";
import { QualityPasses } from "../render/QualityPasses";
import { ShadowUpdater } from "../render/ShadowUpdater";
import { SSAO } from "../render/SSAO";
import { LocalAssetWarningBanner } from "../security/LocalAssetWarningBanner";
import { useEngineObjectStore } from "../stores/EngineObjectStore";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";
import { VFXPasses } from "../vfx/VFXPasses";
import { VFXSync } from "../vfx/VFXSync";
import { FloorCollider } from "../world/FloorCollider";
import { Sky } from "../world/Sky";
import { SDKWorldEnvironmentProvider, useWorldEnvironment, WORLD_ENV_DEFAULT, WORLD_ENV_GRAYSPACE } from "../world/WorldEnvironmentContext";
import { EngineObjectSpawner } from "./EngineObjectSpawner";
import { EngineObjectSync } from "./EngineObjectSync";
import { FlatLoadingScreen, VRLoadingScreen } from "./LoadingScreen";
import { SSGIPass } from "../render/SSGIPass";


configureTextBuilder({
    useWorker: false
});

export const xr_store = createXRStore({
    controller: XRAvatarHand,
    handTracking: false,
    offerSession: false
});

// three.js's WebXRManager only calls `gl.makeXRCompatible()` lazily, on
// enterVR(), if the context wasn't already created with `xrCompatible:
// true`. On machines where the headset is driven by a different GPU/adapter
// than the page's WebGL context, that *late* call can force Chrome to
// genuinely destroy and recreate the context to move rendering onto the
// right adapter — that's the "context lost" you're hitting, since by then
// the canvas has already been actively rendering the spectator view on the
// wrong adapter. Pre-creating the context as xrCompatible makes that check
// a no-op, so the swap (if any) happens once, at mount, before you've
// rendered anything that matters.
// https://github.com/mrdoob/three.js/issues/30674
const make_xr_compatible_renderer = ({ canvas }: DefaultGLProps) => {
    if (!("getContext" in canvas)) {
        throw new Error("Canvas does not support getContext");
    }

    const context = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        xrCompatible: true
    }) as WebGL2RenderingContext | null;

    return new WebGLRenderer({
        canvas,
        ...(context ? { context } : { alpha: false, antialias: false }), // fallback if webgl2 ctx creation somehow fails
        outputBufferType: HalfFloatType, // use xr aware post processing gl effects pipeline // TODO: not all that perf friendly. allow disabling the advanced graphics pipeline to support stuff like quest standalone. look at general optimisations and presets
    });
};

const VRErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
    <group position={[0, 1.5, -2]}>
        {/* Background Panel */}
        <mesh>
            <planeGeometry args={[2.5, 1.2]} />
            <meshBasicMaterial color="#4a0000" /> {/* Dark red alert color */}
        </mesh>

        {/* Title Text */}
        <Text
            position={[0, 0.3, 0.01]}
            fontSize={0.15}
            color="white"
            anchorY="middle">
            Game Error
        </Text>

        {/* Actual Error Message */}
        <Text
            position={[0, 0, 0.01]}
            fontSize={0.07}
            color="#ffcccc"
            maxWidth={2.2}
            textAlign="center">
            {getErrorMessage(error) || "An unexpected error occurred."}
        </Text>

        {/* Interactive Restart Button */}
        <mesh
            position={[0, -0.35, 0.01]}
            onClick={resetErrorBoundary} // Your XR PointerEvents will trigger this!
            onPointerOver={(e) => ((e.object as Mesh).material as MeshBasicMaterial).color.set("white")} // Hover effect
            onPointerOut={(e) => ((e.object as Mesh).material as MeshBasicMaterial).color.set("#cccccc")}>
            <planeGeometry args={[0.8, 0.25]} />
            <meshBasicMaterial color="#cccccc" />

            <Text position={[0, 0, 0.01]} fontSize={0.08} color="black">
                Restart Session
            </Text>
        </mesh>
    </group>
);

const FatalErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 text-white gap-8">
        <h1 className="text-3xl font-bold">Fatal Error</h1>
        <p className="text-lg text-red-400">
            {getErrorMessage(error) || "An unexpected error occurred."}
        </p>
        <button
            onClick={resetErrorBoundary}
            className="px-6 py-3 bg-red-600 rounded hover:bg-red-700 transition cursor-pointer">
            Restart Session
        </button>
    </div>
);

const FlatErrorFallback = VRErrorFallback; // TODO: make it follow player more properly

const LOADER_TIMEOUT_MS = 15_000; // the game has 15 seconds to tell us it's done loading, otherwise we assume it's stuck and show the default world

const SceneContents = ({
    player_ref,
    extra_in_origin
}: {
    player_ref?: React.RefObject<Group | null>;
    extra_in_origin?: React.ReactNode;
}) => {
    const internal_ref = useRef<Group>(null);
    useImperativeHandle(player_ref, () => internal_ref.current!);

    const {url, meta, meta_generation} = useTabSession();
    const setRecentWorlds = useStorage("local", "recent_worlds", [] as string[])[1];

    useEffect(() => {
        if (!url) {
            return;
        }

        setRecentWorlds((prev) => {
            const newList = [url, ...prev.filter((uri) => uri !== url)];
            return newList.slice(0, 25); // Keep only the last 25 unique worlds
        });
    }, [url, setRecentWorlds]);

    const {world_env, setWorldEnv} = useWorldEnvironment();
    const {sky, fog} = world_env;

    const world_ready = useWorldLoadingStateStore((store) => store.world_ready);
    const timed_out = useWorldLoadingStateStore((store) => store.timed_out);
    const set_timed_out = useWorldLoadingStateStore((store) => store.set_timed_out);
    const set_loading = useWorldLoadingStateStore((store) => store.set_loading);

    const resolved_meta = timed_out ? "defer" : meta;

    const show_default_world = resolved_meta !== "supported";
    const spawning_enabled = resolved_meta !== "disable";
    const show_loader = resolved_meta === "supported" && !world_ready;

    useEffect(() => {
        if (meta === "defer" || meta === "disable") {
            setWorldEnv(WORLD_ENV_GRAYSPACE);
        }
    }, [meta, setWorldEnv]);

    // reset world env and player position/rotation on new document load
    useEffect(() => {
        if (meta_generation === 0) {
            return;
        }

        setWorldEnv(meta === "supported" ? WORLD_ENV_DEFAULT : WORLD_ENV_GRAYSPACE);

        if (internal_ref.current) {
            internal_ref.current.position.set(0, 0, 0);
            internal_ref.current.rotation.set(0, 0, 0);
        }
    }, [meta_generation, meta, setWorldEnv]);

    useEffect(() => {
        if (!show_loader) {
            return;
        }

        const timeout = setTimeout(() => {
            console.warn("World never signalled ready, falling back to defer");
            set_timed_out(true);
            setWorldEnv(WORLD_ENV_GRAYSPACE);
        }, LOADER_TIMEOUT_MS);

        return () => {
            clearTimeout(timeout);
        };
    }, [show_loader, set_timed_out, setWorldEnv]);

    useEffect(() => {
        set_loading(show_loader);
    }, [show_loader, set_loading]);

    const [ssao_mode] = useSetting("ssao_mode");

    // apply collision filters
    useFilterContactPair(filter_contact_pair);

    return (
        <>
            <FloorCollider />

            <Sky
                {...sky}
            />
            <fog attach="fog" args={[fog.color, fog.near, fog.far]} />

            <Player can_move={!show_loader} ref={internal_ref} />

            {show_default_world && (
                <>
                    <URLBar
                        position={[0, 3.25, -4]}
                        height={0.25}
                        height_of_dom_mirror={3}
                    />
                    <DOMMirror position={[0, 1.5, -4]} height={3} />

                    <AvatarMirror
                        x_z_offset={[2, 0]}
                        rotation={[0, -Math.PI / 2, 0]}
                    />
                </>
            )}

            {spawning_enabled && <EngineObjectSpawner />}

            {show_loader && <VRLoadingScreen />}

            <AnimationRunner />
            <TweenRunner />
            <ObjectMonitorRunner />
            <InputMonitorRunner />

            <SSAO mode={ssao_mode} />
            {/*TODO: should ssao even be in use in vr? if not, then may as well use react-three postprocessing (which doesn't work in vr but prob more battle tested than out own ao sahder) */}

            {extra_in_origin || null}
        </>
    );
};

const WorldPhysics = ({children}: {children: React.ReactNode}) => {
    const {world_env} = useWorldEnvironment();
    const [show_colliders] = useSetting("debug_colliders");

    // using varying timestep rather than interpolate as determinism not required (mutliplayer will be authoritative state, not lockstep)
    // interpolate also makes physics run a step behind, which makes the grab driving less responsive for example
    return (
        <Physics timeStep="vary" gravity={[0, world_env.physics.gravity, 0]} debug={show_colliders}>
            {children}
        </Physics>
    );
}

const WorldSessionListener = () => {
    const { on_action } = useWebSDKMessaging();
    const { meta, meta_generation } = useTabSession();

    const set_world_ready = useWorldLoadingStateStore((store) => store.set_world_ready);
    const reset_for_new_document = useWorldLoadingStateStore((store) => store.reset_for_new_document);
    const clear_all_objects = useEngineObjectStore((store) => store.clear_all_objects);

    useEffect(() => {
        const unlisten = on_action("HVRSDK_LOADING_FINISHED", (_message, reply) => {
            console.log("World signalled ready");
            set_world_ready(true);

            reply({
                for: "HVRSDK_LOADING_FINISHED",
                success: true
            });
        });

        return () => {
            unlisten();
        };
    }, [on_action, set_world_ready]);

    useEffect(() => {
        if (meta_generation === 0) {
            return;
        }

        console.log("New document, meta:", meta);

        // reset world
        clear_all_objects();
        reset_for_new_document();
        clear_collider_collision_info();
    }, [meta_generation, meta, clear_all_objects, reset_for_new_document]);

    return null;
};

const EngineHostInternal = memo(
    ({ on_ready, mode }: { on_ready: () => void; mode: "vr" | "flat" }) => {
        // gracefully end session on unmount to avoid renderer crash
        useEffect(() => {
            return () => {
                const session = xr_store.getState().session;
                if (session) {
                    session.end().catch((err: Error) => {
                        console.error(
                            "Failed to end XR session on unmount:",
                            err
                        );
                    });
                }
            };
        }, []);

        const canvas_container_ref = useRef<HTMLDivElement>(null);

        const handle_created = useCallback(
            ({ gl }: RootState) => {
                gl.toneMapping = ACESFilmicToneMapping; // TODO: this used to be neutral, but really it'd be good if the SDK decides
                gl.toneMappingExposure = 1.2;

                gl.domElement.addEventListener(
                    "webglcontextlost",
                    (event) => {
                        // @ts-ignore non-standard, present in Chrome
                        console.error("Context Lost:", event["statusMessage"]);
                    },
                    false
                );

                on_ready();
            },
            [on_ready]
        );

        const player_ref = useRef<Group>(null);
        const loading = useWorldLoadingStateStore((store) => store.loading);

        const [show_fps] = useSetting("show_fps");
        const [shadows] = useSetting("shadows_mode");

        const soft_shadows_props = useMemo(() => {
            if (shadows === "off" || shadows === "basic") {
                return {
                    size: 0,
                    samples: 0,
                    focus: 0
                };
            }

            return ({
                samples: shadows === "soft_low" ? 4 : shadows === "soft_medium" ? 8 : 16,
                size: shadows === "soft_low" ? 8 : shadows === "soft_medium" ? 16 : 25,
                focus: 0
            });
        }, [shadows]);

        const shadow_mode = useMemo(() => {
            if (shadows === "off") return false;
            if (shadows === "basic") return "basic";
            return "soft";
        }, [shadows]);

        return (
            <SessionModeProvider value={mode}>
                <TabSessionProvider>
                    <WebSDKMessagingProvider>
                        <HintStateProvider>
                            <WorldSessionListener />

                            <EngineObjectSync />
                            <AnimationSync />
                            <HUDSync />
                            <VFXSync />

                            <LocalAssetWarningBanner />

                            <div
                                className={`w-full h-full relative ${mode === "vr" ? "max-w-[calc(100vh*16/9)] max-h-[calc(100vw*9/16)]" : ""}`}
                                ref={canvas_container_ref}
                            >
                                {mode === "vr" && <LogoOverlay />}
                                {mode === "flat" && (
                                    <>
                                        <AutoHintGlyphs
                                            side="left"
                                            className="opacity-75 z-2 absolute bottom-4 left-4 text-white text-shadow-sm text-xs sm:text-sm md:text-base lg:text-lg flex gap-4 items-center"
                                            action_className="flex gap-2 items-center"
                                            glyph_className="flex gap-2 items-center"
                                        />
                                        <AutoHintGlyphs
                                            side="right"
                                            className="opacity-75 z-2 absolute bottom-4 right-4 text-white text-shadow-sm text-xs sm:text-sm md:text-base lg:text-lg flex gap-4 items-center"
                                            action_className="flex gap-2 items-center"
                                            glyph_className="flex gap-2 items-center"
                                        />

                                        <Crosshair />
                                    </>
                                )}

                                {loading && <FlatLoadingScreen />}

                                <AvatarProvider>
                                    <PlayerOriginProvider value={player_ref}>
                                        <Canvas
                                            gl={make_xr_compatible_renderer}
                                            onCreated={handle_created}
                                            shadows={shadow_mode}
                                        >
                                            <HintDevicePublisher />
                                            {show_fps && <Stats />}

                                            <GraphicsPipeline>
                                                <SceneRenderPass />
                                                <SSGIPass />
                                                <VFXPasses />
                                                <QualityPasses />
                                                {/*<SRGBOutputPass />*/}
                                            </GraphicsPipeline>

                                            <SoftShadows size={soft_shadows_props.size} samples={soft_shadows_props.samples} focus={soft_shadows_props.focus} />
                                            <ShadowUpdater />

                                            <AudioListenerProvider>
                                                <QuarksProvider>
                                                    <HandsProvider>
                                                        <SDKWorldEnvironmentProvider>
                                                            <WorldPhysics>
                                                                <CameraSetup />
                                                                <CanvasResizer
                                                                    containerRef={canvas_container_ref}
                                                                />

                                                                <SceneDebug />

                                                                {mode === "vr" ? (
                                                                    <XR store={xr_store}>
                                                                        <ErrorBoundary
                                                                            FallbackComponent={
                                                                                VRErrorFallback
                                                                            }
                                                                            onReset={() =>
                                                                                window.location.reload()
                                                                            }>
                                                                            <SceneContents
                                                                                player_ref={player_ref}
                                                                                extra_in_origin={
                                                                                    <Suspense fallback={null}>
                                                                                        <SpectatorCamera />
                                                                                    </Suspense>
                                                                                }
                                                                            />
                                                                        </ErrorBoundary>
                                                                    </XR>
                                                                ) : (
                                                                    <ErrorBoundary
                                                                        FallbackComponent={
                                                                            FlatErrorFallback
                                                                        }
                                                                        onReset={() =>
                                                                            window.location.reload()
                                                                        }
                                                                    >
                                                                        <FlatInputProvider>
                                                                            <FlatClickRaycaster />
                                                                            <FlatAvatarHands />
                                                                            <SceneContents player_ref={player_ref} />
                                                                        </FlatInputProvider>
                                                                    </ErrorBoundary>
                                                                )}
                                                            </WorldPhysics>
                                                        </SDKWorldEnvironmentProvider>
                                                    </HandsProvider>
                                                </QuarksProvider>
                                            </AudioListenerProvider>
                                        </Canvas>
                                    </PlayerOriginProvider>
                                </AvatarProvider>
                            </div>
                        </HintStateProvider>
                    </WebSDKMessagingProvider>
                </TabSessionProvider>
            </SessionModeProvider>
        );
    }
);

// TODO: how could the contexts be denested for cleanliness

export const EngineHost = ({ on_xr_ready, mode }: { on_xr_ready: () => void, mode: "vr" | "flat" }) => (
    <ErrorBoundary
        FallbackComponent={FatalErrorFallback}
        onReset={() => window.location.reload()}
    >
        <EngineHostInternal on_ready={on_xr_ready} mode={mode} />
    </ErrorBoundary>
);

// TODO: see if soft reset possible
