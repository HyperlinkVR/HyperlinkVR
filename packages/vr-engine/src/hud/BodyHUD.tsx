import {useFrame, useThree} from "@react-three/fiber";
import {useMemo, useRef} from "react";
import {Group, MathUtils, Quaternion, Vector3} from "three";

import {HUDSurface, hud_vr_pixel_size, HUD_VR_DISTANCE} from "./HUDSurface";
import {Layer, LayerGroup} from "../render";
import {get_united_head_camera} from "../util/get_head_cameras";

const HEIGHT_SMOOTHING = 5;
const YAW_SMOOTHING = 3;

const YAW_DEAD_ZONE = MathUtils.degToRad(35);
const YAW_SETTLE = MathUtils.degToRad(1);

const wrap_angle = (angle: number): number => {
    const two_pi = Math.PI * 2;
    let wrapped = (angle + Math.PI) % two_pi;
    if (wrapped < 0) wrapped += two_pi;
    return wrapped - Math.PI;
};

export const BodyHUD = () => {
    const group_ref = useRef<Group>(null);

    const current_yaw = useRef<number | null>(null);
    const current_height = useRef<number | null>(null);

    const head_position = useMemo(() => new Vector3(), []);
    const head_quaternion = useMemo(() => new Quaternion(), []);
    const forward = useMemo(() => new Vector3(), []);

    const chasing = useRef(false);

    const {gl, camera} = useThree();

    useFrame((_, delta) => {
        const group = group_ref.current;
        if (!group) {
            return;
        }

        const head_camera = get_united_head_camera(gl, camera);

        head_camera.getWorldPosition(head_position);
        head_camera.getWorldQuaternion(head_quaternion);

        forward.set(0, 0, -1).applyQuaternion(head_quaternion);
        const head_yaw = Math.atan2(-forward.x, -forward.z);

        if (current_yaw.current === null) {
            current_yaw.current = head_yaw;
        }

        const yaw_error = wrap_angle(head_yaw - current_yaw.current);

        if (Math.abs(yaw_error) > YAW_DEAD_ZONE) {
            chasing.current = true;
        }

        if (chasing.current) {
            current_yaw.current = wrap_angle(
                current_yaw.current + yaw_error * (1 - Math.exp(-YAW_SMOOTHING * delta))
            );

            if (Math.abs(yaw_error) < YAW_SETTLE) {
                chasing.current = false;
            }
        }

        const target_height = head_position.y;
        if (current_height.current === null) {
            current_height.current = target_height;
        } else {
            current_height.current = MathUtils.lerp(
                current_height.current,
                target_height,
                1 - Math.exp(-HEIGHT_SMOOTHING * delta)
            );
        }

        // camera XZ rather than the origin, so walking the playspace carries the panel
        group.position.set(head_position.x, current_height.current, head_position.z);
        group.rotation.set(0, current_yaw.current, 0);
        group.translateZ(-HUD_VR_DISTANCE);
    });

    return (
        <group ref={group_ref}>
            <LayerGroup layers={[Layer.HUD]}>
                <HUDSurface anchor="body" pixel_size={hud_vr_pixel_size()} />
            </LayerGroup>
        </group>
    );
};
