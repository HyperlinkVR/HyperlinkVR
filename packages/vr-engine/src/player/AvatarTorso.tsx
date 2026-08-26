import { useSetting } from "@hyperlinkvr/react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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

export const AvatarTorso = () => {
    const { scene: torso_scene } = useGLTF(torso);

   useAvatarMaterials(torso_scene);

   // TODO: load clothing layer

    const anchor_ref = useRef<Group>(null);

    // a point that lags slightly behind the true camera position, to lean the torso from the base towards locomotion
    const lean_lag_anchor_ref = useRef<Vector3 | null>(null);

    const [player_height_cm] = useSetting("player_height_cm");
    const target_height = useMemo(() => (player_height_cm / 100) * TARGET_TORSO_PERCENTAGE, [player_height_cm]);
    console.log("target torso height", target_height, "m");
    const scale_factor = useMemo(() => target_height / BASE_TORSO_HEIGHT_M, [target_height]);

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

    useFrame(({ camera }, delta) => {
        if (!anchor_ref.current) return;

        const pos = new Vector3();
        const quat = new Quaternion();

        camera.getWorldPosition(pos);
        camera.getWorldQuaternion(quat);

        // place torso below the head
        pos.y -= 0.166 * scale_factor;

        if (!lean_lag_anchor_ref.current) {
            lean_lag_anchor_ref.current = pos.clone();
        }

        const lean_lag_smoothing = 1 - Math.pow(LEAN_LAG_RATE, delta);
        lean_lag_anchor_ref.current.lerp(pos, lean_lag_smoothing);

        // rotate torso to match camera rotation, but only on the y-axis
        // TODO lag rotation slightlky
        const forward = new Vector3(0, 0, -1).applyQuaternion(quat);
        const yaw = Math.atan2(-forward.x, -forward.z);
        quat.setFromAxisAngle(Y_AXIS, yaw);

        // apply torso leaning proportional to the difference between lagged and true position
        const world_diff = new Vector3().subVectors(pos, lean_lag_anchor_ref.current);
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

        anchor_ref.current.position.copy(pos);
        anchor_ref.current.quaternion.copy(quat);
        //group_ref.current.updateWorldMatrix(true, false);
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
