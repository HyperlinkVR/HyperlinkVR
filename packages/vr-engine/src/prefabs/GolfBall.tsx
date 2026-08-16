import {useGLTF} from "@react-three/drei";
import {ObjectPhysics} from "../engine/ObjectPhysics";
import {PrefabProps} from "../types";
import {GolfBallPrefab} from "@hyperlinkvr/vr-engine-schemas";
import {useEffect} from "react";
import {Mesh} from "three";

const MESH_URL = new URL("../../assets/prefabs/golf_ball/golf_ball.glb", import.meta.url).href;

// the material has this colour backed in, so work not required if the user doesn't specify a colour
const DEFAULT_ALBEDO = 0xb1b1b1;

export const GolfBall = (props: PrefabProps<GolfBallPrefab>) => {
    const {scene} = useGLTF(MESH_URL);
    const instance = scene.clone(true);

    useEffect(() => {
        if (!props.color || props.color === DEFAULT_ALBEDO) {
            // no work needed
            return;
        }

        instance.traverse((child) => {
            // TODO: can we access by the material name? might be quicker. but only 1 object in the scene so not a big deal
            if (child instanceof Mesh && child.material) {
                const cloned_material = child.material.clone();
                cloned_material.color.set(props.color);
                child.material = cloned_material;
            }
        });
    }, [props.color]);

    return (
        <ObjectPhysics physics={{
            rigid_body: {
                type: "dynamic",
                mass: 0.045,
                restitution: 0.7,
                friction: 0.5,
                ccd: true,
                collider: {
                    type: "sphere",
                    radius: 0.03
                }

                // TODO: ignore player collision
            }
        }}>
            <primitive object={instance} />
        </ObjectPhysics>
    );
}
