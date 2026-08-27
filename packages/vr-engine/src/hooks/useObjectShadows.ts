import type { ObjectShadows } from "@hyperlinkvr/vr-engine-schemas";
import { useMemo } from "react";
import type { Object3D } from "three";

export const useObjectShadows = (instance: Object3D, shadows: Required<ObjectShadows>) => {
    // apply shadow preferences to all meshes in the scene
    useMemo(() => {
        instance.traverse((child: any) => {
            if (child.isMesh && child.material) {
                const author_override = child.material.userData?.cast_shadow;

                // transmissives (e.g. glass) by default also don't want to cast shadows unless specified
                const is_transmissive = child.material.transmission > 0;

                if (author_override !== undefined) {
                    child.castShadow = author_override;
                } else if (is_transmissive) {
                    child.castShadow = false;
                } else {
                    child.castShadow = shadows.cast;
                }

                child.receiveShadow = shadows.receive;
                child.material.needsUpdate = true;
            }
        });
    }, [instance, shadows]);
}
