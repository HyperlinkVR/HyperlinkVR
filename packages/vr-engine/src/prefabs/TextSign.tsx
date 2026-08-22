import { TextSignPrefab } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useMemo, useState } from "react";



import { useObjectBinding } from "../hooks/useObjectBinding";
import { PrefabProps } from "../types";
import { FloatingText2D } from "./FloatingText2D";
import { PrefabRoot } from "./PrefabRoot";


export const DefaultTextSign = (props: PrefabProps<TextSignPrefab>) => {
    if (props.text.length > 20) {
        props.text = props.text.substring(0, 20) + "...";
    }

    const box_color = useMemo(() => props.style_parameters?.box_color || 0x111111, [props.style_parameters]);
    const bg_color = useMemo(() => props.style_parameters?.background_color || 0xffffff, [props.style_parameters]);

    return (
        <group>
            <mesh>
                <boxGeometry args={[0.8, 0.2, 0.025]} />
                <meshStandardMaterial color={box_color} />
            </mesh>
            <mesh position={[0, 0, 0.013]}>
                <planeGeometry args={[0.75, 0.15]} />
                <meshStandardMaterial color={bg_color} emissive={bg_color} />

            </mesh>

            <FloatingText2D offset={[0, 0, 0.015]} text={props.text} font_size={0.075} color={props.color} />
        </group>
    );
}

// TODO: dynamic font downsize to fit
// TODO: more typesafe params in schema
// TODO: enforce length limit on sdk
// TODO: apply physics, with option to be fixed or dynamic, and whether grabbable

const TextSignInternal = (props: PrefabProps<TextSignPrefab>) => {
    switch (props.style) {
        case "default":
            return <DefaultTextSign {...props} />;
        case "wooden":
            throw new Error("Wooden text sign style not implemented yet");
        case "nameplate":
            throw new Error("Nameplate text sign style not implemented yet");
        default:
            throw new Error(`Unknown text sign style: ${props.style}`);
    }
}

export const TextSign = (props: PrefabProps<TextSignPrefab>) => {
    const [text, setText] = useState(props.text);
    const [color, setColor] = useState(props.color);
    const [font_size, setFontSize] = useState(props.font_size);
    const [style, setStyle] = useState(props.style);
    const [style_parameters, setStyleParameters] = useState(props.style_parameters);

    const state_props = useMemo(() => ({
        ...props,
        text,
        color,
        font_size,
        style,
        style_parameters
    }), [props, text, color, font_size, style, style_parameters]);

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
                case "set_style":
                    setStyle(args.style);
                    break;
                case "set_style_parameters":
                    setStyleParameters(args.style_parameters);
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

    return (
        <PrefabRoot {...props}>
            <TextSignInternal {...state_props} />
        </PrefabRoot>
    );
};
