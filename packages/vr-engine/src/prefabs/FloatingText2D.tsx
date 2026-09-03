import type { FloatingText2DPrefab } from "@hyperlinkvr/vr-engine-schemas";
import { Text } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";



import { useObjectBinding } from "../hooks/useObjectBinding";
import type { PrefabProps } from "../types";
import { PrefabRoot } from "./PrefabRoot";
import { MeshStandardMaterial } from "three";


export const FloatingText2D = (props: PrefabProps<FloatingText2DPrefab> & {offset?: [number, number, number]}) => {
    const [text, setText] = useState(props.text);
    const [color, setColor] = useState(props.color);
    const [font_size, setFontSize] = useState(props.font_size);
    const [shading, setShading] = useState(props.shading);

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
                case "set_shading":
                    setShading(args.shading);
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

    // TODO: can this be done more optimally
    const shading_material = useMemo(() => {
        switch (shading.type) {
            case "unshaded":
                // drei defaults to basic mat
                return undefined;
            case "standard":
                return new MeshStandardMaterial({
                    color: color,
                    roughness: shading.roughness,
                    metalness: shading.metalness,
                });
            case "emissive":
                return new MeshStandardMaterial({
                    color: color,
                    emissive: shading.emissive_color_override ?? color,
                    emissiveIntensity: shading.emissive_intensity
                });
            default:
                console.warn("Unknown shading type", shading);
                return undefined;
        }
    }, [shading, color]);

    // TODO: wire up more props like text style. maybe even have a rich text parser that splits it into subcomponents or something. also add a list of builtin typefaces they can pick
    return (
        <PrefabRoot {...props}>
            <Text
                position={props.offset || [0, 0, 0]}
                color={color}
                fontSize={font_size}
                castShadow
                material={shading_material}
            >
                {text}
            </Text>
        </PrefabRoot>
    );
}
