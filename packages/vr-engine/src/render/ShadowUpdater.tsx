import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useSetting } from "@hyperlinkvr/react";
import { shadow_camera_layer_mask } from "./CameraSetup";

export const ShadowUpdater = () => {
    const [shadow_mode] = useSetting("shadows_mode");
    const { scene, gl } = useThree();

    useEffect(() => {
        gl.shadowMap.enabled = shadow_mode !== "off";

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

    return null;
}
