import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Group, PerspectiveCamera, Vector3} from "three";

import {HUDSurface, HUD_CANVAS_WIDTH, HUD_CANVAS_HEIGHT} from "./HUDSurface";
import {Layer, LayerGroup} from "../render";

// close enough to read, far enough to clear the near plane. the canvas is scaled to the frustum at this distance, so the value itself is arbitrary
const FLAT_HUD_DISTANCE = 1;

// the canvas spans this fraction of the frustum, leaving a margin at the edges
const FLAT_HUD_FILL = 0.9;

export const FlatHUD = () => {
    const {camera, size} = useThree();
    const group_ref = useRef<Group>(null);

    const forward = useMemo(() => new Vector3(), []);

    useFrame(() => {
        const group = group_ref.current;
        if (!group) {
            return;
        }

        camera.getWorldDirection(forward);
        camera.getWorldPosition(group.position);
        group.position.addScaledVector(forward, FLAT_HUD_DISTANCE);
        group.quaternion.copy(camera.quaternion);
    });

    // fit the canvas inside the frustum on whichever axis is tighter, so the layout never stretches
    const pixel_size = useMemo(() => {
        const perspective = camera as PerspectiveCamera;
        const frustum_height = 2 * FLAT_HUD_DISTANCE * Math.tan((perspective.fov * Math.PI) / 360);
        const frustum_width = frustum_height * (size.width / size.height);

        return FLAT_HUD_FILL * Math.min(
            frustum_width / HUD_CANVAS_WIDTH,
            frustum_height / HUD_CANVAS_HEIGHT
        );
    }, [camera, size.width, size.height]);

    return (
        <group ref={group_ref}>
            <LayerGroup layers={[Layer.HUD]}>
                <HUDSurface anchor={null} pixel_size={pixel_size} />
            </LayerGroup>
        </group>
    );
};
