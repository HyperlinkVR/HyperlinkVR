import {FloatingText3DPrefab} from "@hyperlinkvr/vr-engine-schemas";
import {PrefabProps} from "../types";

import {Text3D} from "@react-three/drei";

const Roboto = new URL("../../assets/font3d/Roboto_Regular.json", import.meta.url).href;

export const FloatingText3D = (props: PrefabProps<FloatingText3DPrefab>) => {
    // TODO: wire up more props like text style. maybe even have a rich text parser that splits it into subcomponents or something. also add a list of builtin typefaces they can pick
    // TODO: option to use meshbasicmaterial to ignore light. maybe option for texture url too
    // TODO: option to make it have physics
    // TODO: option to bevel
    return (
        <Text3D font={Roboto} size={props.font_size} height={props.depth}>
            {props.text}
            <meshStandardMaterial color={props.color} />
        </Text3D>
    );
}
