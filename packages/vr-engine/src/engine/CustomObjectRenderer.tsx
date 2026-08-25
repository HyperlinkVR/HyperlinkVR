import { CustomObject, ObjectShadows } from "@hyperlinkvr/vr-engine-schemas";
import { useGLTF } from "@react-three/drei";


import { RendererComponentProps } from "../types";
import { ObjectInteractions } from "./ObjectInteractions";
import { ObjectPhysics } from "./ObjectPhysics";

import { clone } from "three/examples/jsm/utils/SkeletonUtils";
import {useMemo} from "react";
import {useMaterialPatternDisruptor} from "../hooks/useMaterialPatternDisruption";
import {useMaterialScroller} from "../hooks/useMaterialScroll";
import {useAssetURL} from "../hooks/useAssetURL";
import { Mesh } from "three";

const GLTFRenderer = ({url, shadows}: {url: string, shadows: Required<ObjectShadows>}) => {
    const {scene, materials} = useGLTF(url);

    // apply material disrupt shader if material userData specifies it
    // since the material and the props will always be the same (baked in), its fine to apply globally here
    useMaterialPatternDisruptor(materials);

    // scroll texture offset for flowing surfaces (water, lava) if material userData specifies it
    useMaterialScroller(materials);

    // useGLTF caches the scene by url, so need to clone to render multiple instances of the same model
    const instance = useMemo(() => clone(scene), [scene]);

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

    return <primitive object={instance} />;
}


export const CustomObjectRenderer = ({ mesh, interactions, physics, transform, shadows }: RendererComponentProps<CustomObject>) => {
    const resolved_url = useAssetURL(mesh);
    if (resolved_url === null) {
        console.warn("CustomObjectRenderer: mesh asset ref could not be resolved");
    }

    const has_movable_physics = useMemo(() => {
        if (!physics) return false;
        return physics.rigid_body?.type !== "fixed";
    }, [physics]);

    const effective_shadows = useMemo(() => {
        // defaults to cast true for everything, receive true for fixed/no physics objects, false for dynamic/physics objects (unless explicitly overridden)

        if (!shadows) {
            return {
                cast: true,
                receive: !has_movable_physics
            }
        }

        return {
            cast: shadows.cast === undefined ? true : shadows.cast,
            receive: shadows.receive === undefined ? !has_movable_physics : shadows.receive
        }
    }, [shadows, has_movable_physics]);

    const visual = useMemo(
        () => (resolved_url ? <GLTFRenderer url={resolved_url} shadows={effective_shadows} /> : null),
        [mesh, resolved_url]
    );

    const with_interactions = useMemo(
        () =>
            interactions ? (
                <ObjectInteractions interactions={interactions}>{visual}</ObjectInteractions>
            ) : (
                visual
            ),
        [interactions, visual]
    );

    const with_physics = useMemo(
        () =>
            physics ? (
                <ObjectPhysics physics={physics} transform={transform}>
                    {with_interactions}
                </ObjectPhysics>
            ) : (
                with_interactions
            ),
        [physics, transform, with_interactions]
    );

    return with_physics;
}
