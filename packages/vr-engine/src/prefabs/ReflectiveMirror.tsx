import { ReflectiveMirrorPrefab } from "@hyperlinkvr/vr-engine-schemas";
import { useFrame } from "@react-three/fiber";
import { ComponentProps, useEffect, useMemo } from "react";
import { Camera, PlaneGeometry } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector";



import { useObjectShadows } from "../hooks/useObjectShadows";
import { compute_layer_mask, Layer } from "../render";
import { PrefabProps } from "../types";
import { get_head_cameras } from "../util/get_head_cameras";
import { PrefabRoot } from "./PrefabRoot";


const DEFAULT_RESOLUTION = 2048;

export const ReflectiveMirror = ({
    width,
    height,
    tint = 0xb0b0b0,
    resolution = DEFAULT_RESOLUTION,
    ...props
}: PrefabProps<ReflectiveMirrorPrefab> & Omit<ComponentProps<"primitive">, "object">) => {
    // extract object id from props, as it'll crash if we assign it to the group element
    const {id, ...rest} = props;

    const reflector = useMemo(() => {
        const geo = new PlaneGeometry(width, height);
        return new Reflector(geo, {
            textureWidth: resolution,
            textureHeight: resolution,
            color: tint,
        });
    }, [width, height, tint]);

    useObjectShadows(reflector, { cast: true, receive: false });

    // dispose GPU resources when the reflector is replaced or unmounted
    useEffect(() => () => reflector.dispose(), [reflector]);

    const layer_mask = useMemo(
        () =>
            compute_layer_mask([
                Layer.Default,
                Layer.PlayerModel_Head,
                Layer.PlayerModel_TorsoAndHands
            ]),
        []
    );

    useFrame(({camera, gl, scene}) => {
        // set both xr cameras to have the right layers masked (i.e. show head even though they cant see it through the headset)
        const cameras = get_head_cameras(gl, camera);
        for (const cam of cameras) {
            reflector.getReflectionCamera(cam).layers.mask = layer_mask;
        }

        // iterate remaining scene cameras for spectator cameras and do the same (TODO: handle MR exclusions)
        // TODO: how performant are these passes? should we only do this when the scene changes or when a new camera is added? (if so how?)
        // TODO: also this totally contains the arraycamera already, so the logic before is a touch redundant
        const scene_cameras = scene.getObjectsByProperty("isCamera", true);
        for (const cam of scene_cameras) {
            if (cam.userData.is_spectator_camera) {
                reflector.getReflectionCamera(cam as Camera).layers.mask =
                    layer_mask;
            }
        }
    });

    return (
        <PrefabRoot {...props}>
            <primitive object={reflector} {...rest} />
        </PrefabRoot>
    );
};
