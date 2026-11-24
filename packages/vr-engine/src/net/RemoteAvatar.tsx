import type { PeerInfo } from "@hyperlinkvr/core";
import { Billboard, Text, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { interactionGroups } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import type { Object3D, Vector3 } from "three";
import { Group } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";

import { StaticAvatarProvider, useAvatarMaterials } from "../contexts/AvatarContext";
import { ObjectPhysics } from "../engine/ObjectPhysics";
import { remote_avatar_body_name } from "../interaction/util/target_resolution";
import { useWorldEnvironment } from "../world/WorldEnvironmentContext";
import { GROUP_PLAYER, GROUP_PROP } from "../physics/collision_groups";
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

// #25: remote players get kinematic bodies that follow their interpolated pose, so they push props
// this engine simulates (the host for unowned ones, the owner for claimed/pinned) and raycasts hit
// them (resolving to that player). they're in the player group so a prop's `players` collision
// filter applies to them like to a local player. they interact with players too only when the world
// turns on player_collisions (then the local character controller is blocked by them, see
// PlayerKinematics); otherwise players walk through each other.
// zones still only detect the local player's own body (the remote_ prefix keeps these out of that),
// since each player's engine reports its own player entering zones.
const REMOTE_BODY_GROUPS = interactionGroups(GROUP_PLAYER, [GROUP_PROP]);
const REMOTE_BODY_GROUPS_COLLIDING = interactionGroups(GROUP_PLAYER, [GROUP_PROP, GROUP_PLAYER]);

const useRemoteBodyGroups = () => {
    const { world_env } = useWorldEnvironment();
    return world_env.physics.player_collisions ? REMOTE_BODY_GROUPS_COLLIDING : REMOTE_BODY_GROUPS;
};

// where a body waits while its part has no pose (no samples yet, or a hand that isn't tracked), so
// it can't knock things around from a stale spot
const PARKED_Y = -1000;

const remote_kinematic = (collider: { type: "sphere"; radius: number } | { type: "auto" }) => ({
    rigid_body: {
        type: "kinematic-pos" as const,
        collider
    }
});

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

const RemoteHead = ({ pose, peer_id }: { pose: SampledPose; peer_id: string }) => {
    const body_groups = useRemoteBodyGroups();
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
            <ObjectPhysics
                body_name={remote_avatar_body_name("head", peer_id)}
                collision_groups={body_groups}
                physics={remote_kinematic({ type: "sphere", radius: 0.12 })}
            />
        </group>
    );
};

const RemoteTorso = ({ pose, height_cm, peer_id }: { pose: SampledPose; height_cm: number; peer_id: string }) => {
    const body_groups = useRemoteBodyGroups();
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
        <>
            {/* same layout as the local torso: pose an empty anchor, and let the body track it with the
                mesh inside the body. nesting the body under the posed group would transform it twice */}
            <group ref={ref} />
            <ObjectPhysics
                body_name={remote_avatar_body_name("torso", peer_id)}
                collision_groups={body_groups}
                physics={remote_kinematic({ type: "auto" })}
                kinematic_pos_tracking_ref={ref}
            >
                <primitive object={torso} />
            </ObjectPhysics>
        </>
    );
};

const RemoteHand = ({ handedness, hand, peer_id }: { handedness: "left" | "right"; hand: SampledHand; peer_id: string }) => {
    const body_groups = useRemoteBodyGroups();
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
            // park it, so the body doesn't linger where the hand was last tracked
            group.position.set(0, PARKED_Y, 0);
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
            <ObjectPhysics
                body_name={remote_avatar_body_name(handedness === "left" ? "hand-left" : "hand-right", peer_id)}
                collision_groups={body_groups}
                physics={remote_kinematic({ type: "sphere", radius: 0.05 })}
            />
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
            // no pose yet: park the whole avatar, bodies included, rather than leave them at the origin
            root_ref.current.position.y = has_pose ? 0 : PARKED_Y;
        }
    }, -1);

    return (
        <StaticAvatarProvider avatar={appearance.avatar}>
            <LayerGroup layers={REMOTE_LAYERS} ref={root_ref} name={`RemoteAvatar-${peer.id}`}>
                <RemoteHead pose={pose} peer_id={peer.id} />
                <RemoteTorso pose={pose} height_cm={appearance.height_cm} peer_id={peer.id} />
                <RemoteHand handedness="left" hand={pose.left} peer_id={peer.id} />
                <RemoteHand handedness="right" hand={pose.right} peer_id={peer.id} />
                <NameTag pose={pose} name={peer.display_name ?? peer.username ?? "Guest"} />
            </LayerGroup>
        </StaticAvatarProvider>
    );
};
