import { FloatingText2DPrefab } from "@hyperlinkvr/vr-engine-schemas";
import { Text } from "@react-three/drei";
import { useEffect, useState } from "react";



import { useObjectBinding } from "../hooks/useObjectBinding";
import { PrefabProps } from "../types";
import { PrefabRoot } from "./PrefabRoot";


export const FloatingText2D = (props: PrefabProps<FloatingText2DPrefab> & {offset?: [number, number, number]}) => {
    const [text, setText] = useState(props.text);
    const [color, setColor] = useState(props.color);
    const [font_size, setFontSize] = useState(props.font_size);

    const {on_prefab_command} = useObjectBinding(props.binding);

    useEffect(() => {
        const unlisten = on_prefab_command(async (command, args) => {
            switch (command) {
                case "set_text":
                    setText(args.text);
                    break;
                case "set_color":
                    setColor(args.color);
                    break;
                case "set_font_size":
                    setFontSize(args.font_size);
                    break;
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }

            return {success: true};
        });

        return () => {
            unlisten();
        };
    }, []);

    // TODO: wire up more props like text style. maybe even have a rich text parser that splits it into subcomponents or something. also add a list of builtin typefaces they can pick
    return (
        <PrefabRoot {...props}>
            <Text position={props.offset || [0, 0, 0]} color={color} fontSize={font_size}>
                {text}
            </Text>
        </PrefabRoot>
    );
}
