import { useSetting } from "@hyperlinkvr/react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {useTouchPointer, useXRInputSourceStateContext} from "@react-three/xr";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowHelper, Group, Mesh, MeshBasicMaterial, Object3D, Quaternion, SphereGeometry, Vector3 } from "three";



import { useAvatarMaterials } from "../contexts/AvatarContext";
import { ObjectPhysics } from "../engine/ObjectPhysics";
import { Hand, useHands } from "../input/hands";
import { LayerGroup } from "../render/LayerGroup";
import { Layer } from "../render/layers";
import {XRTeleportControl} from "../input/impl/xr/locomotion";
import {PLAYER_COLLISION_GROUPS} from "../physics/collision_groups";


const left_hand = new URL("../../assets/player/hands/left.glb", import.meta.url).href;
const right_hand = new URL("../../assets/player/hands/right.glb", import.meta.url).href;

const FINGER_NAMES = ["middle", "ring", "pinky"];
const SEGMENT_NAMES = ["proximal", "intermediate", "distal"];
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

interface ChainLink {
    bone: Object3D;
    bindQuat: Quaternion;
    bindQuatInverse: Quaternion;
    bindPos: Vector3;
}

// TODO: disable ray when touch has a hit
// TODO: prevent double touch when passing through watch

const pose_to_curl = (p: Hand["pose"]["current"]): number => {
    if (p.kind === "curl") return p.amount;
    return p.name === "fist" ? 1.2 : 0;
};

const TOUCH_HOVER_RADIUS = 0.04;
const TOUCH_DOWN_RADIUS = 0.01;

const AvatarHandModel = ({
    hand,
    handedness,
    touch_origin_ref,
    on_touch_glue,
    children,
    auto_position = true
}: {
    hand: Hand | null;
    handedness: "left" | "right";
    touch_origin_ref?: React.RefObject<Group | null>;
    on_touch_glue?: (index_tip_bone: Object3D) => void;
    children?: React.ReactNode;
    auto_position?: boolean;
}) => {
    const { scene: hand_scene } = useGLTF(
        handedness === "left" ? left_hand : right_hand
    );
    useAvatarMaterials(hand_scene);

    const curlRef = useRef(0);
    const chainsRef = useRef<Record<string, ChainLink[]> | null>(null);
    const thumbChainRef = useRef<ChainLink[] | null>(null);

    // bind-pose capture + FK chain build
    useEffect(() => {
        if (!hand_scene) return;

        hand_scene.traverse((node: any) => {
            if (node.isBone && !node.userData.initialQuaternion) {
                node.userData.initialQuaternion = node.quaternion.clone();
                node.userData.initialPosition = node.position.clone();
            }
        });
        const chains: Record<string, ChainLink[]> = {};
        FINGER_NAMES.forEach((finger) => {
            const bones = SEGMENT_NAMES.map((seg) =>
                hand_scene.getObjectByName(`${finger}-finger-phalanx-${seg}`)
            );
            if (bones.some((b) => !b)) return;
            chains[finger] = bones.map((bone: any) => {
                const bindQuat = bone.userData.initialQuaternion.clone();
                return {
                    bone,
                    bindQuat,
                    bindQuatInverse: bindQuat.clone().invert(),
                    bindPos: bone.userData.initialPosition.clone()
                };
            });
        });
        chainsRef.current = chains;
        const thumbBones = ["proximal", "distal"].map((seg) =>
            hand_scene.getObjectByName(`thumb-phalanx-${seg}`)
        );
        thumbChainRef.current = thumbBones.every(Boolean)
            ? thumbBones.map((bone: any) => {
                  const bindQuat = bone.userData.initialQuaternion.clone();
                  return {
                      bone,
                      bindQuat,
                      bindQuatInverse: bindQuat.clone().invert(),
                      bindPos: bone.userData.initialPosition.clone()
                  };
              })
            : null;
    }, [hand_scene]);

    const math = useMemo(
        () => ({
            rayPos: new Vector3(),
            rayQuat: new Quaternion(),
            delta: new Quaternion(),
            localDeltaWorld: new Quaternion(),
            cumulative: new Quaternion(),
            offset: new Vector3(),
            thumbGoal: new Quaternion(),
        }),
        []
    );

    const root_ref = useRef<Group | null>(null);
    useFrame(() => {
        if (!hand_scene || !chainsRef.current) return;

        // follow the world-space grip node, and write world matrix directly so being a child of the origin doesn't double-apply the origin transform
        const render_root = root_ref.current;
        const grip_node = hand?.grip.current ?? null;
        if (auto_position && render_root && grip_node) {
            grip_node.updateWorldMatrix(true, false);
            render_root.matrixAutoUpdate = false;
            if (render_root.parent) {
                render_root.parent.updateWorldMatrix(true, false);
                render_root.matrix
                    .copy(render_root.parent.matrixWorld)
                    .invert()
                    .multiply(grip_node.matrixWorld);
            } else {
                render_root.matrix.copy(grip_node.matrixWorld);
            }
            render_root.matrixWorldNeedsUpdate = true;
        }

        if (touch_origin_ref?.current && on_touch_glue) {
            const index_tip_bone = hand_scene.getObjectByName("index-finger-phalanx-distal");
            if (index_tip_bone) on_touch_glue(index_tip_bone);
        }

        // curl comes from hand pose, but smoothed to animate
        const target = hand ? pose_to_curl(hand.pose.current) : 0;
        const smoothing = 1 - Math.pow(0.0001, 0.016);
        curlRef.current += (target - curlRef.current) * smoothing;
        const curl = curlRef.current;

        // fold fingers
        Object.values(chainsRef.current).forEach((chain) => {
            math.cumulative.identity();
            chain.forEach(({ bone, bindQuat, bindQuatInverse, bindPos }, i) => {
                math.delta.setFromAxisAngle(X_AXIS, -curl * (1 - i * 0.1));
                bone.quaternion
                    .copy(math.cumulative)
                    .multiply(bindQuat)
                    .multiply(math.delta);
                if (i === 0) bone.position.copy(bindPos);
                else {
                    const prevBone = chain[i - 1].bone,
                        prevBindPos = chain[i - 1].bindPos;
                    math.offset
                        .copy(bindPos)
                        .sub(prevBindPos)
                        .applyQuaternion(math.cumulative);
                    bone.position.copy(prevBone.position).add(math.offset);
                }
                math.localDeltaWorld
                    .copy(bindQuat)
                    .multiply(math.delta)
                    .multiply(bindQuatInverse);
                math.cumulative.multiply(math.localDeltaWorld);
            });
        });

        // fold thumb
        const thumbChain = thumbChainRef.current;
        if (thumbChain) {
            const thumbCurlX = -0.3,
                thumbCurlZ = -0.2;
            const t = Math.min(Math.max(curl / 1.2, 0), 1);
            math.cumulative.identity();
            thumbChain.forEach(
                ({ bone, bindQuat, bindQuatInverse, bindPos }, i) => {
                    math.delta.setFromAxisAngle(
                        X_AXIS,
                        i === 0 ? thumbCurlX * t : thumbCurlX * t * 0.6
                    );
                    if (i === 0) {
                        math.thumbGoal.setFromAxisAngle(Z_AXIS, thumbCurlZ * t);
                        math.delta.multiply(math.thumbGoal);
                    }
                    bone.quaternion
                        .copy(math.cumulative)
                        .multiply(bindQuat)
                        .multiply(math.delta);
                    if (i === 0) bone.position.copy(bindPos);
                    else {
                        const prevBone = thumbChain[i - 1].bone,
                            prevBindPos = thumbChain[i - 1].bindPos;
                        math.offset
                            .copy(bindPos)
                            .sub(prevBindPos)
                            .applyQuaternion(math.cumulative);
                        bone.position.copy(prevBone.position).add(math.offset);
                    }
                    math.localDeltaWorld
                        .copy(bindQuat)
                        .multiply(math.delta)
                        .multiply(bindQuatInverse);
                    math.cumulative.multiply(math.localDeltaWorld);
                }
            );
        }
    });

    return (
        <LayerGroup layers={[Layer.PlayerModel_TorsoAndHands]} ref={root_ref}>
            <group rotation={[Math.PI / 2, 0, 0]} pointerEvents="none">
                <primitive object={hand_scene} />
            </group>
            <group ref={touch_origin_ref} />
            {children}
        </LayerGroup>
    );
};

export const XRAvatarHand = () => {
    const input_source_state = useXRInputSourceStateContext("controller");
    const handedness = input_source_state.inputSource.handedness;

    const [locomotion] = useSetting("vr_locomotion");
    const [locomotion_hand] = useSetting("vr_locomotion_hand");

    const hands = useHands();

    const touch_origin_ref = useRef<Group>(null);
    useTouchPointer(touch_origin_ref, input_source_state, {
        hoverRadius: TOUCH_HOVER_RADIUS,
        downRadius: TOUCH_DOWN_RADIUS
    });

    const [debug_touch] = useSetting("debug_touch");

    const glue = useMemo(
        () => ({
            fingertip_position: new Vector3(),
            fingertip_quaternion: new Quaternion(),
            parent_quaternion: new Quaternion(),
            debug_direction: new Vector3(),
            debug_arrow: new ArrowHelper(
                new Vector3(0, 0, -1),
                new Vector3(),
                0.05,
                0x00ff00
            ),
            debug_hover_sphere: new Mesh(
                new SphereGeometry(TOUCH_HOVER_RADIUS, 16, 16),
                new MeshBasicMaterial({
                    color: 0xff00ff,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.5
                })
            ),
            debug_down_sphere: new Mesh(
                new SphereGeometry(TOUCH_DOWN_RADIUS, 16, 16),
                new MeshBasicMaterial({
                    color: 0x00ffff,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.5
                })
            )
        }),
        []
    );

    // glue touch origin to index fingertip
    const glue_touch_origin = useCallback(
        (index_tip_bone: Object3D) => {
            const touch_origin = touch_origin_ref.current;
            if (!touch_origin || !touch_origin.parent) return;

            index_tip_bone.updateWorldMatrix(true, false);
            index_tip_bone.getWorldPosition(glue.fingertip_position);
            index_tip_bone.getWorldQuaternion(glue.fingertip_quaternion);

            touch_origin.parent.worldToLocal(glue.fingertip_position);
            touch_origin.parent.getWorldQuaternion(glue.parent_quaternion);
            glue.fingertip_quaternion.premultiply(
                glue.parent_quaternion.invert()
            );

            touch_origin.position.copy(glue.fingertip_position);
            touch_origin.quaternion.copy(glue.fingertip_quaternion);
            touch_origin.translateZ(-0.015);
            touch_origin.updateMatrixWorld(true);

            if (debug_touch) {
                glue.debug_direction
                    .set(0, 0, -1)
                    .applyQuaternion(touch_origin.quaternion)
                    .normalize();
                glue.debug_arrow.setDirection(glue.debug_direction);
                glue.debug_arrow.position.copy(touch_origin.position);
                glue.debug_hover_sphere.position.copy(touch_origin.position);
                glue.debug_down_sphere.position.copy(touch_origin.position);
            }
        },
        [glue, debug_touch]
    );

    const hand =
        hands.find((candidate) => candidate.handedness === handedness) ?? null;

    return (
        <Suspense fallback={null}>  {/* TODO: can have a little fallback avatar while it loads, just a gray or translucent placeholder akin to vrchat */}
            <AvatarHandModel
                hand={hand}
                handedness={handedness}
                touch_origin_ref={touch_origin_ref}
                on_touch_glue={glue_touch_origin}
                auto_position={false} // handled by controller positioning
            >
                {debug_touch && (
                    <>
                        <primitive object={glue.debug_arrow} />
                        <primitive object={glue.debug_hover_sphere} />
                        <primitive object={glue.debug_down_sphere} />
                    </>
                )}

                {/* TODO: move this outside the suspense boundary but dont break the alignment */}
                {locomotion === "teleport" && handedness === locomotion_hand && (
                    <XRTeleportControl input_source_state={input_source_state} enabled />
                )}

                <ObjectPhysics
                    body_name={`avatar_hand_rb-${handedness}`}
                    collision_groups={PLAYER_COLLISION_GROUPS}
                    physics={{
                        rigid_body: {
                            type: "kinematic-pos",
                            collider: { type: "sphere", radius: 0.05 }
                        }
                    }}
                />
            </AvatarHandModel>
        </Suspense>
    );
};

export const FlatAvatarHands = () => {
    const hands = useHands();
    return (
        <>
            {hands.map((hand) => (
                <Suspense fallback={null}>  {/* TODO: can have a little fallback avatar while it loads, just a gray or translucent placeholder akin to vrchat */}
                    <AvatarHandModel
                        key={hand.handedness}
                        hand={hand}
                        handedness={hand.handedness}
                    >
                        <ObjectPhysics
                            body_name={`avatar_hand_rb-${hand.handedness}`}
                            collision_groups={PLAYER_COLLISION_GROUPS}
                            physics={{
                                rigid_body: {
                                    type: "kinematic-pos",
                                    collider: { type: "sphere", radius: 0.05 }
                                }
                            }}
                        />
                    </AvatarHandModel>
                </Suspense>
            ))}
        </>
    );
};
