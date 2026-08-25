import { CustomObject } from "@hyperlinkvr/vr-engine-schemas";
import { useGLTF } from "@react-three/drei";


import { RendererComponentProps } from "../types";
import { ObjectInteractions } from "./ObjectInteractions";
import { ObjectPhysics } from "./ObjectPhysics";

import { clone } from "three/examples/jsm/utils/SkeletonUtils";
import {useMemo} from "react";
import {useMaterialPatternDisruptor} from "../hooks/useMaterialPatternDisruption";
import {useMaterialScroller} from "../hooks/useMaterialScroll";
import {useAssetURL} from "../hooks/useAssetURL";

const GLTFRenderer = ({url}: {url: string}) => {
    const {scene, materials} = useGLTF(url);

    // apply material disrupt shader if material userData specifies it
    // since the material and the props will always be the same (baked in), its fine to apply globally here
    useMaterialPatternDisruptor(materials);

    // scroll texture offset for flowing surfaces (water, lava) if material userData specifies it
    useMaterialScroller(materials);

    // useGLTF caches the scene by url, so need to clone to render multiple instances of the same model
    const instance = useMemo(() => clone(scene), [scene]);

    return <primitive object={instance} />;
}


export const CustomObjectRenderer = ({ mesh, interactions, physics, transform }: RendererComponentProps<CustomObject>) => {
    const resolved_url = useAssetURL(mesh);
    if (resolved_url === null) {
        console.warn("CustomObjectRenderer: mesh asset ref could not be resolved");
    }

    const visual = useMemo(
        () => (resolved_url ? <GLTFRenderer url={resolved_url} /> : null),
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
