import { useMessageEngine, useSetting, useTabSession } from "@hyperlinkvr/react";
import { PlayerMonitorSchema } from "@hyperlinkvr/vr-engine-schemas";
import { Text } from "@react-three/drei";
import { XROrigin } from "@react-three/xr";
import { Suspense, useEffect, useImperativeHandle, useRef } from "react";
import type { Group } from "three";



import { useWebSDKMessaging } from "../contexts";
import type { ExpressionMouth} from "../contexts/PlayerExpressionContext";
import { PlayerExpressionProvider, usePlayerExpression } from "../contexts/PlayerExpressionContext";
import { useSessionMode } from "../contexts/SessionModeContext";
import { BodyHUD } from "../hud/BodyHUD";
import { FlatHUD } from "../hud/FlatHUD";
import { HeadHUD } from "../hud/HeadHUD";
import { OriginHUD } from "../hud/OriginHUD";
import { FlatHandsPublisher } from "../input/impl/flat/hands";
import { FlatLocomotion } from "../input/impl/flat/locomotion";
import { XRHandsPublisher } from "../input/impl/xr/hands";
import { XRLocomotion } from "../input/impl/xr/locomotion";
import { register_input_monitor, unregister_input_monitor } from "../monitors/input_monitor_registry";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";
import { Avatar } from "./Avatar";
import { FlatCameraRig } from "./FlatCameraRig";
import { PlayerKinematics } from "./PlayerKinematics";
import { useIsSeated } from "./seating";
import { LOCAL_PLAYER_SUBJECT } from "./subject";
import { Vignette } from "./Vignette";
import { WristWatch } from "./WristWatch";


const MouthTest = ({
    mouth_name,
    position
}: {
    mouth_name: ExpressionMouth;
    position: [number, number, number];
}) => {
    const { set_mouth } = usePlayerExpression();

    return (
        <group
            name="MouthTest"
            position={position}
            onClick={() => set_mouth(mouth_name)}>
            <mesh name="MouthTestPlane">
                <planeGeometry args={[0.3, 0.3]} />
                <meshBasicMaterial
                    color="white"
                    transparent
                    opacity={0.5}
                    side={2}
                />
            </mesh>

            <Text
                name="MouthTestText"
                position={[0, 0, 0.01]}
                fontSize={0.05}
                color="black"
                anchorX="center"
                anchorY="middle">
                {mouth_name}
            </Text>
        </group>
    );
};

const ExpressionTest = () => {
    const [show_expression_test] = useSetting("debug_show_expression_ui");

    if (!show_expression_test) {
        return null;
    }

    return (
        <group name="ExpressionTest">
            <Text
                position={[0, 2, -1]}
                fontSize={0.1}
                color="white"
                anchorX="center"
                anchorY="middle">
                Mouth Expression Test
            </Text>
            <MouthTest mouth_name="default" position={[-0.5, 1.5, -1]} />
            <MouthTest mouth_name="big_smile" position={[0, 1.5, -1]} />
            <MouthTest mouth_name="wobbly_frown" position={[0.5, 1.5, -1]} />
        </group>
    );
};

export const Player = ({ ref = null, can_move = true }: { ref?: React.Ref<Group>; can_move?: boolean }) => {
    const origin_ref = useRef<Group>(null);
    useImperativeHandle(ref, () => origin_ref.current!);

    const session_mode = useSessionMode();

    const {on_action, emit_event, connected} = useWebSDKMessaging();
    const messenger = useMessageEngine();
    const {id: tab_id} = useTabSession();

    const seated = useIsSeated();

    const world_ready = useWorldLoadingStateStore((store) => store.world_ready);
    const spawned_for_world = useRef(false);

    useEffect(() => {
        if (!world_ready) {
            // re-arm for the next world
            spawned_for_world.current = false;
            return;
        }

        // only emit the spawn event once per world load, and only if we are connected and have a valid origin ref
        if (spawned_for_world.current || !connected || !origin_ref.current) {
            return;
        }

        spawned_for_world.current = true;
        try {
            emit_event({
                type: "HVRSDK_PLAYER_SPAWNED",
                username: null, // local player
                mode: session_mode
            });
        } catch (error) {
            console.warn("Failed to emit player spawn event", error);
        }
    }, [world_ready, connected, session_mode, emit_event]);

    useEffect(() => {
        // TODO: these ignore target username on the message and assume its for us, nothing to do rn but just remember this is the case when multiplayer happens

        const unlisten_get_pos = on_action("HVRSDK_PLAYER_GET_POSITION", (message, reply) => {
            if (!origin_ref.current) {
                reply({
                    for: "HVRSDK_PLAYER_GET_POSITION",
                    error: "Player origin not available"
                });
                return;
            }

            const pos = origin_ref.current.position;
            const yaw = origin_ref.current.rotation.y;
            reply({
                for: "HVRSDK_PLAYER_GET_POSITION",
                position: [pos.x, pos.y, pos.z],
                yaw
            });
        });

        const unlisten_teleport_to = on_action("HVRSDK_PLAYER_TELEPORT_TO", (message, reply) => {
            if (!origin_ref.current) {
                reply({
                    for: "HVRSDK_PLAYER_TELEPORT_TO",
                    error: "Player origin not available"
                });
                return;
            }

            // TODO: optional (maybe default) fade out and in, will at least do vignette for now but would help to have them differentiate between teleporting and lag!
            const pos = message.position;
            const yaw = message.yaw;

            if (pos !== undefined) {
                origin_ref.current.position.set(pos[0], pos[1], pos[2]);
            }

            if (yaw !== undefined) {
                origin_ref.current.rotation.y = yaw;
            }

            const new_pos = origin_ref.current.position;
            const new_yaw = origin_ref.current.rotation.y;

            reply({
                for: "HVRSDK_PLAYER_TELEPORT_TO",
                new_position: [new_pos.x, new_pos.y, new_pos.z],
                new_yaw
            });
        });

        const unlisten_send_to_world = on_action("HVRSDK_PLAYER_SEND_TO_WORLD", (message, reply) => {
            // verify url
            try {
                new URL(message.url);
            } catch (e) {
                reply({
                    for: "HVRSDK_PLAYER_SEND_TO_WORLD",
                    error: `Invalid URL: ${message.url}`
                });
                return;
            }

            // TODO: implement prompt, for now will always send
            // prompt behaviours: show = always show a prompt, try_skip = try to skip the prompt if possible (same origin/trust check to implement), but otherwise show it, skip_or_fail = skip the prompt if possible, but if it cannot be skipped then auto-fail

            // ask the background to send them there
            messenger.send({
                action: "HVR_NAVIGATE",
                url: message.url,
                tab: tab_id
            }).then(() => reply({
                // chance they might never get this, but it's not their problem at that point, the new page will load
                for: "HVRSDK_PLAYER_SEND_TO_WORLD",
                going: true
            })).catch((err) => {
                reply({
                    for: "HVRSDK_PLAYER_SEND_TO_WORLD",
                    error: err.message || "Failed to send player to world"
                });
            });
        });

        const unlisten_add_monitor = on_action("HVRSDK_PLAYER_ADD_MONITOR", (message, reply) => {
            const {success, data} = PlayerMonitorSchema.safeParse(message.monitor);
            if (!success) {
                console.error("Failed to parse player monitor", message.monitor);
                reply({
                    for: "HVRSDK_PLAYER_ADD_MONITOR",
                    error: "Failed to parse player monitor"
                });
                return;
            }

            const registered = register_input_monitor(LOCAL_PLAYER_SUBJECT, data);
            if (!registered) {
                reply({
                    for: "HVRSDK_PLAYER_ADD_MONITOR",
                    error: "Monitor was rejected: it has no binding id or reports nothing"
                });
                return;
            }

            reply({
                for: "HVRSDK_PLAYER_ADD_MONITOR",
                success: true,
                monitor_id: data.binding!.id!
            });
        });

        const unlisten_remove_monitor = on_action("HVRSDK_PLAYER_REMOVE_MONITOR", (message, reply) => {
            const removed = unregister_input_monitor(message.monitor_id);

            // the sdk drops its own bookkeeping regardless of the outcome, so an
            // unknown id is reported but is not treated as a failure worth retrying
            reply({
                for: "HVRSDK_PLAYER_REMOVE_MONITOR",
                success: true,
                was_registered: removed
            });
        });

        return () => {
            unlisten_get_pos();
            unlisten_teleport_to();
            unlisten_send_to_world();
            unlisten_add_monitor();
            unlisten_remove_monitor();
        }
    }, []);

    return (
        <group name="Player">
            <PlayerExpressionProvider>
                <Suspense fallback={null}> {/* TODO: can have a little fallback avatar while it loads, just a gray or translucent placeholder akin to vrchat */}
                    <Avatar />
                </Suspense>

                <WristWatch />

                <PlayerKinematics />

                {session_mode === "vr" ? (
                    <>
                        <Vignette />
                        <XROrigin ref={origin_ref}>
                            <XRHandsPublisher />
                            <ExpressionTest />
                            <OriginHUD />
                        </XROrigin>
                        <BodyHUD />
                        <HeadHUD />
                        {can_move && !seated && <XRLocomotion origin={origin_ref} />}
                    </>
                ) : (
                    <>
                        <group ref={origin_ref} name="FlatOrigin">
                            <FlatHandsPublisher />
                            <FlatCameraRig origin={origin_ref} />
                            <ExpressionTest />
                        </group>
                        <FlatHUD />
                        {can_move && !seated && <FlatLocomotion origin={origin_ref} />}
                    </>
                )}
            </PlayerExpressionProvider>
        </group>
    );
};
