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

// neck pivot relative to the eyes, in head space. FLAT_BACK doesn't rotate with the head
const NECK_DOWN = 0.1;
const NECK_BACK = 0.03;
const FLAT_BACK = 0.02;
const TORSO_BELOW_NECK = 0.066;
const MAX_NECK_PITCH = 0.9; // radians, soft cap

// tilt about the hips past the soft cap
const TORSO_PIVOT_BELOW_TOP = 0.5; // model origin is at the top
const TILT_FOLLOW_UP = 1.5;
const TILT_FOLLOW_DOWN = 1.3;
const MAX_TORSO_TILT = 0.35; // radians
const NECK_SLIDE_TAIL = 0.3; // how much pitch past the cap still slides
const RISE_FOLLOW_UP = 1;
const RISE_FOLLOW_DOWN = 0;

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
    const quat = head_quat.clone();

    // pitch-independent so looking up/down doesn't cause leaning
    const lean_pos = head_pos.clone();
    lean_pos.y -= (NECK_DOWN + TORSO_BELOW_NECK) * scale_factor;

    const anchor = lag_anchor ?? lean_pos.clone();

    const lean_lag_smoothing = 1 - Math.pow(LEAN_LAG_RATE, delta);
    anchor.lerp(lean_pos, lean_lag_smoothing);

    // rotate torso to match camera rotation, but only on the y-axis
    // blend in head up so yaw is stable looking straight up/down
    // TODO lag rotation slightlky
    const forward = new Vector3(0, 0, -1).applyQuaternion(quat);
    const up = new Vector3(0, 1, 0).applyQuaternion(quat);
    const pitch = Math.asin(Math.max(-1, Math.min(1, forward.y)));
    const yaw_dir = forward.addScaledVector(up, -forward.y);
    const yaw = Math.atan2(-yaw_dir.x, -yaw_dir.z);
    quat.setFromAxisAngle(Y_AXIS, yaw);

    // hang the torso from the neck pivot, following a soft-capped pitch
    const capped_pitch = MAX_NECK_PITCH * Math.tanh(pitch / MAX_NECK_PITCH);
    const neck_pitch = capped_pitch + (pitch - capped_pitch) * NECK_SLIDE_TAIL;
    const neck_quat = quat.clone().multiply(new Quaternion().setFromAxisAngle(X_AXIS, neck_pitch));
    const pos = new Vector3(0, -NECK_DOWN, NECK_BACK)
        .multiplyScalar(scale_factor)
        .applyQuaternion(neck_quat)
        .add(head_pos);
    pos.y -= TORSO_BELOW_NECK * scale_factor;

    pos.x += Math.sin(yaw) * FLAT_BACK * scale_factor;
    pos.z += Math.cos(yaw) * FLAT_BACK * scale_factor;

    // make up the capped pitch by tilting about the hips (z) and lifting (y)
    const neck_z = (p: number) => -NECK_DOWN * Math.sin(p) + NECK_BACK * Math.cos(p);
    const neck_y = (p: number) => -NECK_DOWN * Math.cos(p) - NECK_BACK * Math.sin(p);
    const residual_z = (neck_z(pitch) - neck_z(neck_pitch)) * scale_factor * (pitch > 0 ? TILT_FOLLOW_UP : TILT_FOLLOW_DOWN);
    const residual_y = (neck_y(pitch) - neck_y(neck_pitch)) * scale_factor;
    pos.y += residual_y * (pitch > 0 ? RISE_FOLLOW_UP : RISE_FOLLOW_DOWN);

    const pivot_len = TORSO_PIVOT_BELOW_TOP * scale_factor;
    const tilt = Math.max(-MAX_TORSO_TILT, Math.min(MAX_TORSO_TILT, Math.atan2(residual_z, pivot_len)));
    pos.add(new Vector3(0, pivot_len * (Math.cos(tilt) - 1), pivot_len * Math.sin(tilt)).applyQuaternion(quat));
    quat.multiply(new Quaternion().setFromAxisAngle(X_AXIS, tilt));

    // apply torso leaning proportional to the difference between lagged and true position
    const world_diff = new Vector3().subVectors(lean_pos, anchor);
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
