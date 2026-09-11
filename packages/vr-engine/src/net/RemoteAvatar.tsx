import type { PeerInfo } from "@hyperlinkvr/core";
import { Billboard, Text, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Object3D, Vector3 } from "three";
import { Group } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";

import { StaticAvatarProvider, useAvatarMaterials } from "../contexts/AvatarContext";
import { AvatarExpression } from "../player/AvatarExpression";
import { HAIR_MODEL_URL } from "../player/AvatarHair";
import { HAND_MODEL_URLS, smooth_curl, useFingerCurl } from "../player/AvatarHand";
import { HEAD_MODEL_URL } from "../player/AvatarHead";
import { pose_torso, torso_scale_for_height, TORSO_MODEL_URL } from "../player/AvatarTorso";
import { Layer, LayerGroup } from "../render";
import type { SampledHand, SampledPose } from "./pose_buffer";
import { get_pose_buffer, make_sampled_pose } from "./pose_buffer";
import type { Appearance } from "./presence_protocol";

// visible to the camera and mirrors, but not to click raycasts
const REMOTE_LAYERS = [Layer.PlayerModel_TorsoAndHands];

const NAME_TAG_HEIGHT = 0.3;

// the cached gltf scene is already mounted by the local avatar, so each remote needs its own copy
const useClonedScene = (url: string) => {
    const { scene } = useGLTF(url);
    const cloned = useMemo<Object3D>(() => clone(scene), [scene]);

    useAvatarMaterials(cloned);

    useEffect(() => {
        cloned.traverse((child) => {
            if (!(child instanceof Group)) {
                child.castShadow = true;
            }
        });
    }, [cloned]);

    return cloned;
};

const RemoteHead = ({ pose }: { pose: SampledPose }) => {
    const head = useClonedScene(HEAD_MODEL_URL);
    const hair = useClonedScene(HAIR_MODEL_URL);
    const ref = useRef<Group>(null);

    useFrame(() => {
        ref.current?.position.copy(pose.head_position);
        ref.current?.quaternion.copy(pose.head_quaternion);
    });

    return (
        <group ref={ref}>
            <primitive object={hair} />
            <primitive object={head} />
            <AvatarExpression layers={REMOTE_LAYERS} />
        </group>
    );
};

const RemoteTorso = ({ pose, height_cm }: { pose: SampledPose; height_cm: number }) => {
    const torso = useClonedScene(TORSO_MODEL_URL);
    const scale_factor = torso_scale_for_height(height_cm);

    useEffect(() => {
        torso.scale.setScalar(scale_factor);
    }, [torso, scale_factor]);

    const ref = useRef<Group>(null);
    const lag_anchor = useRef<Vector3 | null>(null);

    useFrame((_, delta) => {
        if (ref.current) {
            lag_anchor.current = pose_torso(pose.head_position, pose.head_quaternion, scale_factor, lag_anchor.current, delta, ref.current);
        }
    });

    return (
        <group ref={ref}>
            <primitive object={torso} />
        </group>
    );
};

const RemoteHand = ({ handedness, hand }: { handedness: "left" | "right"; hand: SampledHand }) => {
    const hand_scene = useClonedScene(HAND_MODEL_URLS[handedness]);
    const apply_curl = useFingerCurl(hand_scene);
    const ref = useRef<Group>(null);
    const curl = useRef(0);

    useFrame(() => {
        const group = ref.current;
        if (!group) {
            return;
        }

        group.visible = hand.visible;
        if (!hand.visible) {
            return;
        }

        group.position.copy(hand.position);
        group.quaternion.copy(hand.quaternion);

        curl.current = smooth_curl(curl.current, hand.curl);
        apply_curl(curl.current);
    });

    // same offset from the grip as the local hand model
    return (
        <group ref={ref}>
            <group rotation={[Math.PI / 2, 0, 0]}>
                <primitive object={hand_scene} />
            </group>
        </group>
    );
};

const NameTag = ({ pose, name }: { pose: SampledPose; name: string }) => {
    const ref = useRef<Group>(null);

    useFrame(() => {
        if (!ref.current) {
            return;
        }

        ref.current.position.copy(pose.head_position);
        ref.current.position.y += NAME_TAG_HEIGHT;
    });

    return (
        <group ref={ref}>
            <Billboard>
                <Text fontSize={0.07} color="white" outlineWidth={0.004} outlineColor="black" anchorY="bottom">
                    {name}
                </Text>
            </Billboard>
        </group>
    );
};

export const RemoteAvatar = ({ peer, appearance }: { peer: PeerInfo; appearance: Appearance }) => {
    const pose = useMemo(make_sampled_pose, []);
    const root_ref = useRef<Group>(null);

    // negative priority so this samples before the parts read it, without taking over the render loop
    useFrame(() => {
        const has_pose = get_pose_buffer(peer.id)?.sample(performance.now(), pose) ?? false;
        if (root_ref.current) {
            root_ref.current.visible = has_pose;
        }
    }, -1);

    return (
        <StaticAvatarProvider avatar={appearance.avatar}>
            <LayerGroup layers={REMOTE_LAYERS} ref={root_ref} name={`RemoteAvatar-${peer.id}`}>
                <RemoteHead pose={pose} />
                <RemoteTorso pose={pose} height_cm={appearance.height_cm} />
                <RemoteHand handedness="left" hand={pose.left} />
                <RemoteHand handedness="right" hand={pose.right} />
                <NameTag pose={pose} name={peer.display_name ?? peer.username ?? "Guest"} />
            </LayerGroup>
        </StaticAvatarProvider>
    );
};
