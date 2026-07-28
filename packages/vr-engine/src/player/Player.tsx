import {useMessageEngine, useSetting, useTabSession} from "@hyperlinkvr/react";
import { Text } from "@react-three/drei";
import { XROrigin } from "@react-three/xr";
import {useEffect, useImperativeHandle, useRef} from "react";
import { Group } from "three";

import {
    ExpressionMouth,
    PlayerExpressionProvider,
    usePlayerExpression
} from "../contexts/PlayerExpressionContext";
import { useSessionMode } from "../contexts/SessionModeContext";
import { FlatLocomotion } from "../input/impl/flat/locomotion";
import { XRLocomotion } from "../input/impl/xr/locomotion";
import { Avatar } from "./Avatar";
import { FlatCameraRig } from "./FlatCameraRig";
import { WristWatch } from "./WristWatch";
import { XRHandsPublisher } from "../input/impl/xr/hands";
import { FlatHandsPublisher } from "../input/impl/flat/hands";
import {Vignette} from "./Vignette";
import {PlayerKinematics} from "./PlayerKinematics";
import {useWebSDKMessaging} from "../contexts";
import {useIsSeated} from "./seating";

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

    const {on_action} = useWebSDKMessaging();
    const messenger = useMessageEngine();
    const {id: tab_id} = useTabSession();

    const seated = useIsSeated();

    useEffect(() => {
        // TODO: these ignore target username on the message and assume its for us, nothing to do rn but just remember this is the case when multiplayer happens

        const unlisten_get_pos = on_action("HVRSDK_PLAYER_GET_POSITION", (message, reply) => {
            if (!origin_ref.current) {
                reply({
                    for: "HVRSDK_PLAYER_GET_POSITION",
                    // TODO: error envelope!
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

        return () => {
            unlisten_get_pos();
            unlisten_teleport_to();
            unlisten_send_to_world();
        }
    }, []);

    return (
        <group name="Player">
            <PlayerExpressionProvider>
                <Avatar />
                <WristWatch />

                <PlayerKinematics />

                {session_mode === "vr" ? (
                    <>
                        <Vignette />
                        <XROrigin ref={origin_ref}>
                            <XRHandsPublisher />
                            <ExpressionTest />
                        </XROrigin>
                        {can_move && !seated && <XRLocomotion origin={origin_ref} />}
                    </>
                ) : (
                    <>
                        <group ref={origin_ref} name="FlatOrigin">
                            <FlatHandsPublisher />
                            <FlatCameraRig origin={origin_ref} />
                            <ExpressionTest />
                        </group>
                        {can_move && !seated && <FlatLocomotion origin={origin_ref} />}
                    </>
                )}
            </PlayerExpressionProvider>
        </group>
    );
};
