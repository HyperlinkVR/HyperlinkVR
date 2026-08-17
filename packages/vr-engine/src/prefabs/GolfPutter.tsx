import {useGLTF} from "@react-three/drei";
import {ObjectPhysics} from "../engine/ObjectPhysics";
import {Grabbable} from "../interaction";
import {PrefabProps} from "../types";
import {GolfPutterPrefab} from "@hyperlinkvr/vr-engine-schemas";
import {useEffect, useMemo} from "react";
import {Mesh} from "three";

const HANDLE_URL = new URL("../../assets/prefabs/golf_putter/handle.glb", import.meta.url).href;
const BODY_URL = new URL("../../assets/prefabs/golf_putter/body.glb", import.meta.url).href;

const PLASTIC_MATERIAL_NAME = "Plastic";

export const GolfPutter = (props: PrefabProps<GolfPutterPrefab>) => {
    const {scene: handle_scene} = useGLTF(HANDLE_URL);
    const {scene: body_scene} = useGLTF(BODY_URL);

    const handle_instance = useMemo(() => handle_scene.clone(true), [handle_scene]);

    const body_instance = useMemo(() => body_scene.clone(true), [body_scene]);

    useEffect(() => {
        if (!props.color) {
            return;
        }

        body_instance.traverse((child) => {
            if (!(child instanceof Mesh)) return;
            if (!child.material || child.material.name !== PLASTIC_MATERIAL_NAME) return;

            // cloned instances still share materials
            const plastic_material = child.material.clone();
            plastic_material.color.setHex(props.color);

            child.material = plastic_material;
        });
    }, [body_instance, props.color]);

    return (
        <group userData={{tags: ["golf_putter"]}}>
            <ObjectPhysics physics={{
                rigid_body: {
                    type: "dynamic",
                    mass: 0.5,
                    ccd: true,
                    collider: {
                        type: "auto"
                    }
                }
            }}>
                <primitive object={body_instance} />

                <Grabbable grab_offset={[0, 0, 0.1]} grab_rotation={[Math.PI/4, 0, 0]}>
                    <primitive object={handle_instance} />
                </Grabbable>
            </ObjectPhysics>
        </group>
    );
};

// TODO: grabbable doesnt know to exclude children from collision
