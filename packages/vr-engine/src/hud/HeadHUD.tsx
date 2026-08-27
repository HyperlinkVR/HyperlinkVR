import {useFrame, useThree} from "@react-three/fiber";
import {useRef} from "react";
import type {Group} from "three";

import {HUDSurface, hud_vr_head_pixel_size, HUD_VR_HEAD_DISTANCE} from "./HUDSurface";
import {Layer, LayerGroup} from "../render";
import {get_united_head_camera} from "../util/get_head_cameras";

export const HeadHUD = () => {
    const group_ref = useRef<Group>(null);

    const {gl, camera} = useThree();

    useFrame((_) => {
        const group = group_ref.current;
        if (!group) {
            return;
        }

        const head_camera = get_united_head_camera(gl, camera);

        head_camera.getWorldPosition(group.position);
        head_camera.getWorldQuaternion(group.quaternion);
        group.translateZ(-HUD_VR_HEAD_DISTANCE);
    });

    return (
        <group ref={group_ref}>
            <LayerGroup layers={[Layer.HUD]}>
                <HUDSurface anchor="head" pixel_size={hud_vr_head_pixel_size()} />
            </LayerGroup>
        </group>
    );
};
