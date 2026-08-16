import {useGLTF} from "@react-three/drei";
import {ObjectPhysics} from "../engine/ObjectPhysics";
import {Grabbable} from "../interaction";
import {PrefabProps} from "../types";
import {GolfPutterPrefab} from "@hyperlinkvr/vr-engine-schemas";
import {useMemo} from "react";
import {Color, Mesh} from "three";
import {ColorConverter} from "three/examples/jsm/math/ColorConverter";

const HANDLE_URL = new URL("../../assets/prefabs/golf_putter/handle.glb", import.meta.url).href;
const BODY_URL = new URL("../../assets/prefabs/golf_putter/body.glb", import.meta.url).href;

// matching the hot pink defined in the material
const SATURATION = 0.9784;
const VALUE = 0.9059;
const HUE_START_POINT_DEG = 332.12;

// the gap in values to ensure a good spread when spawning many putters
const RANDOM_HUE_STEP_SIZE_DEG = 30;
const HUE_STEP_COUNT = 360 / RANDOM_HUE_STEP_SIZE_DEG;

const PLASTIC_MATERIAL_NAME = "Plastic";

// non repeating randomisation of hue steps
let hue_step_bag: number[] = [];

const refill_hue_step_bag = () => {
    hue_step_bag = Array.from({length: HUE_STEP_COUNT}, (_, step_index) => step_index);

    for (let index = hue_step_bag.length - 1; index > 0; index--) {
        const swap_index = Math.floor(Math.random() * (index + 1));
        [hue_step_bag[index], hue_step_bag[swap_index]] = [hue_step_bag[swap_index], hue_step_bag[index]];
    }
};

const take_hue_step = () => {
    if (hue_step_bag.length === 0) {
        refill_hue_step_bag();
    }
    return hue_step_bag.pop() as number;
};

const generate_color = () => {
    const random_hue_deg = (HUE_START_POINT_DEG + take_hue_step() * RANDOM_HUE_STEP_SIZE_DEG) % 360;

    const color = new Color();
    ColorConverter.setHSV(color, random_hue_deg / 360, SATURATION, VALUE);
    return color;
};

// TODO: expose color to sdk so it can make matching ball (maybe we set the color in the builder and then they can read it there? but then if they arent using the builder then it won't be auto randomised)

export const GolfPutter = (props: PrefabProps<GolfPutterPrefab>) => {
    const {scene: handle_scene} = useGLTF(HANDLE_URL);
    const {scene: body_scene} = useGLTF(BODY_URL);

    const handle_instance = useMemo(() => handle_scene.clone(true), [handle_scene]);

    const body_instance = useMemo(() => {
        const instance = body_scene.clone(true);
        const random_color = generate_color();

        instance.traverse((child) => {
            if (!(child instanceof Mesh)) return;
            if (!child.material || child.material.name !== PLASTIC_MATERIAL_NAME) return;

            // cloned instances still share materials
            const plastic_material = child.material.clone();

            if (props.color !== undefined) {
                plastic_material.color.setHex(props.color);
            } else {
                plastic_material.color.copy(random_color);
            }

            child.material = plastic_material;
        });

        return instance;
    }, [body_scene, props.color]);

    return (
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
    );
};
