import type { FloatingText3DPrefab } from "@hyperlinkvr/vr-engine-schemas";
import { Text3D } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";



import { useObjectBinding } from "../hooks/useObjectBinding";
import type { PrefabProps } from "../types";
import { PrefabRoot } from "./PrefabRoot";
import { usePrefabShadingComponent } from "./usePrefabShading";


const Roboto = new URL("../../assets/font3d/Roboto_Regular.json", import.meta.url).href;

export const FloatingText3D = (props: PrefabProps<FloatingText3DPrefab>) => {
    const [text, setText] = useState(props.text);
    const [color, setColor] = useState(props.color);
    const [font_size, setFontSize] = useState(props.font_size);
    const [depth, setDepth] = useState(props.depth);
    const [shading, setShading] = useState(props.shading);

    const { on_prefab_command } = useObjectBinding(props.binding);

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
                case "set_depth":
                    setDepth(args.depth);
                    break;
                case "set_shading":
                    setShading(args.shading);
                    break;
                default:
                    return {
                        success: false,
                        error: `Unknown command ${command}`
                    };
            }

            return { success: true };
        });

        return () => {
            unlisten();
        };
    }, []);

    const shading_component = usePrefabShadingComponent(shading, color);

    // TODO: wire up more props like text style. maybe even have a rich text parser that splits it into subcomponents or something. also add a list of builtin typefaces they can pick
    // TODO: option to use meshbasicmaterial to ignore light. maybe option for texture url too
    // TODO: option to make it have physics
    // TODO: option to bevel
    return (
        <PrefabRoot {...props}>
            <Text3D font={Roboto} size={font_size} height={depth} castShadow receiveShadow>
                {text}
                {shading_component}
            </Text3D>
        </PrefabRoot>
    );
};
