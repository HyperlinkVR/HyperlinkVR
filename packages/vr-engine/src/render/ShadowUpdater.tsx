import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useSetting } from "@hyperlinkvr/react";
import { shadow_camera_layer_mask } from "./CameraSetup";

// regenerate shadow maps every Nth frame instead of every frame (a lot cheaper and imperceptible)
const SHADOW_UPDATE_INTERVAL = 2;

export const ShadowUpdater = () => {
    const [shadow_mode] = useSetting("shadows_mode");
    const { scene, gl } = useThree();
    const frame = useRef(0);

    useEffect(() => {
        gl.shadowMap.enabled = shadow_mode !== "off";

        // we will manually trigger shadow map updates
        gl.shadowMap.autoUpdate = false;
        gl.shadowMap.needsUpdate = true;

        // force all materials to update, so that they will respect the new shadow config
        scene.traverse((child: any) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(
                        (mat: any) => (mat.needsUpdate = true)
                    );
                } else {
                    child.material.needsUpdate = true;
                }
            }
        });
    }, [shadow_mode, scene, gl]);

    // set layer mask on all shadow map renders
    useEffect(() => {
        const original = gl.shadowMap.render.bind(gl.shadowMap);
        gl.shadowMap.render = (lights, scene, camera) => {
            const saved = camera.layers.mask;
            camera.layers.mask = shadow_camera_layer_mask;
            original(lights, scene, camera);
            camera.layers.mask = saved;
        };
        return () => { gl.shadowMap.render = original; };
    }, [gl]);

    // update shadow maps every Nth frame
    useFrame(() => {
        if (!gl.shadowMap.enabled) return;
        frame.current = (frame.current + 1) % SHADOW_UPDATE_INTERVAL;
        if (frame.current === 0) gl.shadowMap.needsUpdate = true;
    });

    return null;
}
