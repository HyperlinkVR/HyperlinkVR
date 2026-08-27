import type { ComponentProps} from "react";
import { useMemo } from "react";
import { MeshBasicMaterial } from "three";



import type { SkinType, SkinWarmth} from "../contexts/AvatarContext";
import { skin_tones, useAvatar } from "../contexts/AvatarContext";


const SkinPaletteOption = ({skin_type, skin_warmth, on_click, chosen, box_size, position}: {
    skin_type: SkinType;
    skin_warmth: SkinWarmth;
    on_click: () => void;
    chosen: boolean;
    box_size: number;
    position: [number, number, number];
}) => {
    const color = useMemo(() => {
        const skin_tone_obj = skin_tones[skin_type];
        // @ts-ignore
        return skin_tone_obj[skin_warmth] || skin_tone_obj.base;
    }, [skin_type, skin_warmth]);

    const material = useMemo(() => new MeshBasicMaterial({color}), [color]);
    
    return (
        <group onClick={on_click} position={position}>
            <mesh material={material}>
                <boxGeometry args={[box_size, box_size, 0]} />
            </mesh>

            {chosen && (
                <mesh position={[0, 0, -0.001]}>
                    <meshBasicMaterial color="white" wireframe />
                    <boxGeometry args={[box_size * 1.2, box_size * 1.2, 0]} />
                </mesh>
            )}
        </group>
    );
}

interface SkinPaletteProps extends ComponentProps<"group"> {
    box_size?: number;
    spacing?: number;
}

export const SkinPalette = ({box_size = 0.1, spacing = 0.1, ...rest}: SkinPaletteProps) => {
    // const [skin_type, setSkinType] = useStoredAvatarProperty("skin_type");
    // const [skin_warmth, setSkinWarmth] = useStoredAvatarProperty("skin_warmth");
    const [avatar, setAvatar] = useAvatar();

    // form a grid of skin tones on horizontal, and skin warmth on vertical
    return (
        <group {...rest}>
            {Object.keys(skin_tones).map((type, i) => {
                const this_type = type as SkinType;
                const skin_tone_obj = skin_tones[this_type];
                return Object.keys(skin_tone_obj).map((warmth, j) => {
                    const this_warmth = warmth as SkinWarmth;
                    const x = i * (box_size + spacing);
                    const y = j * (box_size + spacing);
                    return (
                        <SkinPaletteOption
                            key={`${this_type}-${this_warmth}`}
                            skin_type={this_type}
                            skin_warmth={this_warmth}
                            on_click={() => {
                                setAvatar((prev) => ({
                                    ...prev,
                                    skin_type: this_type,
                                    skin_warmth: this_warmth,
                                }));
                            }}
                            chosen={avatar.skin_type === this_type && avatar.skin_warmth === this_warmth}
                            box_size={box_size}
                            position={[x, y, 0]}
                        />
                    );
                });
            })}
        </group>
    );
}
