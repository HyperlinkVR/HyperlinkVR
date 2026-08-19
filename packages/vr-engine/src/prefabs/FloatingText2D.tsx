import {FloatingText2DPrefab} from "@hyperlinkvr/vr-engine-schemas";
import {PrefabProps} from "../types";

import {Text} from "@react-three/drei";
import { PrefabRoot } from "./PrefabRoot";

export const FloatingText2D = (props: PrefabProps<FloatingText2DPrefab> & {offset?: [number, number, number]}) => {
    // TODO: wire up more props like text style. maybe even have a rich text parser that splits it into subcomponents or something. also add a list of builtin typefaces they can pick
    return (
        <PrefabRoot {...props}>
            <Text position={props.offset || [0, 0, 0]} color={props.color} fontSize={props.font_size}>
                {props.text}
            </Text>
        </PrefabRoot>
    );
}
