import type { PeerInfo } from "@hyperlinkvr/core";
import { Billboard, Text, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { interactionGroups, useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import type { Object3D, Vector3 } from "three";
import { Group } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";

import { StaticAvatarProvider, useAvatarMaterials } from "../contexts/AvatarContext";
import { ObjectPhysics } from "../engine/ObjectPhysics";
import { remote_avatar_body_name } from "../interaction/util/target_resolution";
import { GROUP_PLAYER, GROUP_PLAYER_BLOCKER, GROUP_PROP } from "../physics/collision_groups";
import { CAPSULE_RADIUS, player_capsule_half_height } from "../player/motion";
import { register_remote_capsule } from "./remote_capsules";
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
// filter applies to them like to a local player. they never block players: player-vs-player is a
// single capsule per remote player (RemoteCapsule), the same shape as the local character controller's,
// so hands reaching out don't bump people and it's one shape test instead of four.
// zones still only detect the local player's own body (the remote_ prefix keeps these out of that),
// since each player's engine reports its own player entering zones.
const REMOTE_BODY_GROUPS = interactionGroups(GROUP_PLAYER, [GROUP_PROP]);
const REMOTE_CAPSULE_GROUPS = interactionGroups(GROUP_PLAYER_BLOCKER, [GROUP_PLAYER]);

// the closest two players get is their capsule radii added. the local controller's radius (0.3) is a
// deliberately generous world-collision radius and already supplies nearly all of that, so a remote
// player's body is barely more than a line: ~0.35m centre to centre, chest to chest (a vr comfort
// boundary can sit on top)
const REMOTE_BODY_RADIUS = 0.05;

// the remote capsule starts this far off the ground: at the local controller's radius, so the local
// capsule only ever meets its straight side. two rounded bottoms meeting at the ground make an upward-
// angled contact the controller reads as a slope to climb, stepping you up onto the other player
const REMOTE_BODY_LIFT = CAPSULE_RADIUS;

// the remote player's body for player-vs-player collisions: a capsule under their head, standing on
// their origin, sized from their head height like the local one. created directly (no ObjectPhysics) and
// registered by collider handle, so the character controller and raycasts can tell whose it is
const RemoteCapsule = ({ pose, peer_id, live }: { pose: SampledPose; peer_id: string; live: { current: boolean } }) => {
    const { world, rapier } = useRapier();

    const { body, collider } = useMemo(() => {
        const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PARKED_Y, 0));
        const collider = world.createCollider(
            rapier.ColliderDesc.capsule(0.6, REMOTE_BODY_RADIUS).setCollisionGroups(REMOTE_CAPSULE_GROUPS),
            body
        );
        return { body, collider };
    }, [world, rapier]);

    useEffect(() => {
        const unregister = register_remote_capsule(collider.handle, peer_id);
        return () => {
            unregister();
            world.removeCollider(collider, false);
            world.removeRigidBody(body);
        };
    }, [world, body, collider, peer_id]);

    useFrame(() => {
        if (!live.current) {
            body.setTranslation({ x: 0, y: PARKED_Y, z: 0 }, false);
            return;
        }
        // the top of their controller's capsule, down to REMOTE_BODY_LIFT off the ground, thin
        const top = 2 * (player_capsule_half_height(pose.head_position.y, pose.origin.y) + CAPSULE_RADIUS);
        const half = Math.max(0.05, (top - REMOTE_BODY_LIFT) / 2 - REMOTE_BODY_RADIUS);
        collider.setHalfHeight(half);
        // nothing it touches is pushed (it only meets character controllers), so it can just be placed
        body.setTranslation({
            x: pose.head_position.x,
            y: pose.origin.y + REMOTE_BODY_LIFT + half + REMOTE_BODY_RADIUS,
            z: pose.head_position.z
        }, false);
    });

    return null;
};

// where a body waits while its part has no pose (no samples yet, or a hand that isn't tracked), so
// it can't knock things around from a stale spot
const PARKED_Y = -1000;

const remote_kinematic = (collider:
    | { type: "sphere"; radius: number }
    | { type: "capsule"; radius: number; height: number; offset?: [number, number, number] }
    | { type: "auto" }) => ({
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
                collision_groups={REMOTE_BODY_GROUPS}
                physics={remote_kinematic({ type: "sphere", radius: 0.12 })}
            />
        </group>
    );
};

const RemoteTorso = ({ pose, height_cm, peer_id }: { pose: SampledPose; height_cm: number; peer_id: string }) => {
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
            {/* the mesh sits in the posed group itself, so it's exactly under the head (keeping the lean).
                unlike the local torso, it isn't inside its physics body: a body only moves on the next
                physics step, and on top of a network-interpolated head that step's lag shows as the head
                floating off the torso. the body is just a collider that follows, for pushing props */}
            <group ref={ref}>
                <primitive object={torso} />
            </group>
            <ObjectPhysics
                body_name={remote_avatar_body_name("torso", peer_id)}
                collision_groups={REMOTE_BODY_GROUPS}
                physics={remote_kinematic({
                    type: "capsule",
                    radius: 0.16 * scale_factor,
                    height: 0.3 * scale_factor,
                    offset: [0, -0.25 * scale_factor, 0]
                })}
                kinematic_pos_tracking_ref={ref}
            />
        </>
    );
};

const RemoteHand = ({ handedness, hand, peer_id }: { handedness: "left" | "right"; hand: SampledHand; peer_id: string }) => {
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
                collision_groups={REMOTE_BODY_GROUPS}
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
    const live = useRef(false);

    // negative priority so this samples before the parts read it, without taking over the render loop
    useFrame(() => {
        const has_pose = get_pose_buffer(peer.id)?.sample(performance.now(), pose) ?? false;
        live.current = has_pose;
        if (root_ref.current) {
            root_ref.current.visible = has_pose;
            // no pose yet: park the whole avatar, bodies included, rather than leave them at the origin
            root_ref.current.position.y = has_pose ? 0 : PARKED_Y;
        }
    }, -1);

    return (
        <StaticAvatarProvider avatar={appearance.avatar}>
            <LayerGroup layers={REMOTE_LAYERS} ref={root_ref} name={`RemoteAvatar-${peer.id}`}>
                <RemoteCapsule pose={pose} peer_id={peer.id} live={live} />
                <RemoteHead pose={pose} peer_id={peer.id} />
                <RemoteTorso pose={pose} height_cm={appearance.height_cm} peer_id={peer.id} />
                <RemoteHand handedness="left" hand={pose.left} peer_id={peer.id} />
                <RemoteHand handedness="right" hand={pose.right} peer_id={peer.id} />
                <NameTag pose={pose} name={peer.display_name ?? peer.username ?? "Guest"} />
            </LayerGroup>
        </StaticAvatarProvider>
    );
};
