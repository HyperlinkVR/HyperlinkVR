import { useSetting } from "@hyperlinkvr/react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Object3D } from "three";
import { Group, Quaternion, Vector3 } from "three";



import { useAvatarMaterials } from "../contexts/AvatarContext";
import { ObjectPhysics } from "../engine/ObjectPhysics";
import { Layer, LayerGroup } from "../render";
import {PLAYER_COLLISION_GROUPS} from "../physics/collision_groups";


const torso = new URL("../../assets/player/torso/torso.glb", import.meta.url).href;
const BASE_TORSO_HEIGHT_M = 0.6;
const TARGET_TORSO_PERCENTAGE = 0.25;

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

const LEAN_LAG_RATE = 0.0002;
const MAX_LEAN = 0.25; // radians
const LEAN_SCALE = 3;

export const TORSO_MODEL_URL = torso;

export const torso_scale_for_height = (player_height_cm: number) =>
    ((player_height_cm / 100) * TARGET_TORSO_PERCENTAGE) / BASE_TORSO_HEIGHT_M;

// places the torso under a head pose, leaning away from lag_anchor (a point that eases after the head, so the torso leans into locomotion)
export const pose_torso = (
    head_pos: Vector3,
    head_quat: Quaternion,
    scale_factor: number,
    lag_anchor: Vector3 | null,
    delta: number,
    out: Object3D
): Vector3 => {
    const pos = head_pos.clone();
    const quat = head_quat.clone();

    // place torso below the head
    pos.y -= 0.166 * scale_factor;

    const anchor = lag_anchor ?? pos.clone();

    const lean_lag_smoothing = 1 - Math.pow(LEAN_LAG_RATE, delta);
    anchor.lerp(pos, lean_lag_smoothing);

    // rotate torso to match camera rotation, but only on the y-axis
    // TODO lag rotation slightlky
    const forward = new Vector3(0, 0, -1).applyQuaternion(quat);
    const yaw = Math.atan2(-forward.x, -forward.z);
    quat.setFromAxisAngle(Y_AXIS, yaw);

    // apply torso leaning proportional to the difference between lagged and true position
    const world_diff = new Vector3().subVectors(pos, anchor);
    const local_diff = world_diff.applyQuaternion(quat.clone().invert());

    const lean_back = Math.max(
        -MAX_LEAN,
        Math.min(MAX_LEAN, local_diff.z * LEAN_SCALE)
    );
    const lean_side = Math.max(
        -MAX_LEAN,
        Math.min(MAX_LEAN, local_diff.x * LEAN_SCALE)
    );

    const lean_quat = new Quaternion()
        .setFromAxisAngle(X_AXIS, lean_back)
        .multiply(new Quaternion().setFromAxisAngle(Z_AXIS, lean_side));

    quat.multiply(lean_quat);

    // move slightly behind the new forward direction
    const flat_forward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    pos.add(flat_forward.multiplyScalar(-0.05));

    out.position.copy(pos);
    out.quaternion.copy(quat);

    return anchor;
};

export const AvatarTorso = () => {
    const { scene: torso_scene } = useGLTF(torso);

   useAvatarMaterials(torso_scene);

   // TODO: load clothing layer

    const anchor_ref = useRef<Group>(null);

    // a point that lags slightly behind the true camera position, to lean the torso from the base towards locomotion
    const lean_lag_anchor_ref = useRef<Vector3 | null>(null);

    const [player_height_cm] = useSetting("player_height_cm");
    const scale_factor = useMemo(() => torso_scale_for_height(player_height_cm), [player_height_cm]);

    useEffect(() => {
        torso_scene.scale.setScalar(scale_factor);
    }, [scale_factor, torso_scene]);

    // cast shadow
    useEffect(() => {
        torso_scene.traverse((child) => {
            if (child instanceof Group) return;
            child.castShadow = true;
        });
    }, [torso_scene]);

    const head = useMemo(() => ({ pos: new Vector3(), quat: new Quaternion() }), []);

    useFrame(({ camera }, delta) => {
        if (!anchor_ref.current) return;

        camera.getWorldPosition(head.pos);
        camera.getWorldQuaternion(head.quat);

        lean_lag_anchor_ref.current = pose_torso(head.pos, head.quat, scale_factor, lean_lag_anchor_ref.current, delta, anchor_ref.current);
    });

    return (
        <LayerGroup layers={[Layer.PlayerModel_TorsoAndHands]}>
            <group ref={anchor_ref} />
            <ObjectPhysics
                body_name="avatar_torso_rb"
                collision_groups={PLAYER_COLLISION_GROUPS}
                physics={{
                    rigid_body: {
                        type: "kinematic-pos",
                        collider: { type: "auto" }
                    }
                }}
                kinematic_pos_tracking_ref={anchor_ref}
            >
                <primitive object={torso_scene} />
            </ObjectPhysics>
        </LayerGroup>
    );
};
