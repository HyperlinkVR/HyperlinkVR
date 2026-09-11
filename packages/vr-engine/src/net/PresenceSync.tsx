import type { SendTarget } from "@hyperlinkvr/core";
import { useDebounce, useSetting } from "@hyperlinkvr/react";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import { retrieved_to_stored_avatar, useAvatar } from "../contexts/AvatarContext";
import type { Hand } from "../input/hands";
import { useHands } from "../input/hands";
import { pose_to_curl } from "../player/AvatarHand";
import { usePresenceStore } from "../stores/PresenceStore";
import { useNetSession } from "./NetSession";
import { clear_pose_buffers, push_pose, retain_pose_buffers } from "./pose_buffer";
import type { Appearance, AppearanceMessage, HandTuple, PoseTuple } from "./presence_protocol";
import { APPEARANCE_CHANNEL, decode_appearance, decode_pose, encode_pose, POSE_CHANNEL } from "./presence_protocol";
import { RemoteAvatar } from "./RemoteAvatar";

const SEND_INTERVAL_S = 1 / 20;

const scratch_position = new Vector3();
const scratch_quaternion = new Quaternion();

const pose_tuple = (position: Vector3, quaternion: Quaternion): PoseTuple => [
    position.x, position.y, position.z,
    quaternion.x, quaternion.y, quaternion.z, quaternion.w
];

const hand_tuple = (hand: Hand | undefined): HandTuple | null => {
    const grip = hand?.grip.current;
    if (!hand || !grip) {
        return null;
    }

    grip.getWorldPosition(scratch_position);
    grip.getWorldQuaternion(scratch_quaternion);
    return [...pose_tuple(scratch_position, scratch_quaternion), pose_to_curl(hand.pose.current)];
};

export const PresenceSync = () => {
    const { room, peers } = useNetSession();
    const hands = useHands();

    const [avatar] = useAvatar();
    const [height_cm] = useSetting("player_height_cm");
    const appearance = useMemo<Appearance>(
        () => ({ avatar: retrieved_to_stored_avatar(avatar), height_cm }),
        [avatar, height_cm]
    );

    // replies always carry the latest look, broadcasts are debounced so dragging a colour picker doesn't flood the room
    const appearance_ref = useRef(appearance);
    appearance_ref.current = appearance;
    const debounced_appearance = useDebounce(appearance, 250);

    // listen before announcing, since anything that lands before a listener is dropped
    useEffect(() => {
        if (!room) {
            return;
        }

        const send_appearance = (target: SendTarget, want_reply: boolean) => {
            const message: AppearanceMessage = { appearance: appearance_ref.current, want_reply };
            room.send(target, APPEARANCE_CHANNEL, JSON.stringify(message));
        };

        const unlisten = room.on_message((message) => {
            if (typeof message.payload !== "string") {
                return;
            }

            if (message.channel === POSE_CHANNEL) {
                const pose = decode_pose(message.payload);
                if (pose) {
                    push_pose(message.from, pose, performance.now());
                }
            } else if (message.channel === APPEARANCE_CHANNEL) {
                const decoded = decode_appearance(message.payload);
                if (!decoded) {
                    return;
                }

                usePresenceStore.getState().set_appearance(message.from, decoded.appearance);
                if (decoded.want_reply) {
                    send_appearance({ peer: message.from }, false);
                }
            }
        });

        send_appearance("others", true);

        return () => {
            unlisten();
            clear_pose_buffers();
            usePresenceStore.getState().clear();
        };
    }, [room]);

    useEffect(() => {
        if (!room) {
            return;
        }

        const message: AppearanceMessage = { appearance: debounced_appearance, want_reply: false };
        room.send("others", APPEARANCE_CHANNEL, JSON.stringify(message));
    }, [room, debounced_appearance]);

    useEffect(() => {
        const peer_ids = new Set(peers.map((peer) => peer.id));
        retain_pose_buffers(peer_ids);
        usePresenceStore.getState().retain(peer_ids);
    }, [peers]);

    const since_send = useRef(0);
    useFrame(({ camera }, delta) => {
        if (!room || peers.length < 2) {
            return;
        }

        since_send.current += delta;
        if (since_send.current < SEND_INTERVAL_S) {
            return;
        }
        since_send.current %= SEND_INTERVAL_S;

        camera.getWorldPosition(scratch_position);
        camera.getWorldQuaternion(scratch_quaternion);
        const head = pose_tuple(scratch_position, scratch_quaternion);

        const pose = encode_pose({
            t: performance.now(),
            head,
            left: hand_tuple(hands.find((hand) => hand.handedness === "left")),
            right: hand_tuple(hands.find((hand) => hand.handedness === "right"))
        });

        room.send("others", POSE_CHANNEL, pose, "unreliable");
    });

    const appearances = usePresenceStore((state) => state.appearances);

    if (!room) {
        return null;
    }

    return (
        <>
            {peers.map((peer) => {
                const peer_appearance = appearances[peer.id];
                if (peer.id === room.self.id || !peer_appearance) {
                    return null;
                }

                return (
                    <Suspense key={peer.id} fallback={null}>
                        <RemoteAvatar peer={peer} appearance={peer_appearance} />
                    </Suspense>
                );
            })}
        </>
    );
};
