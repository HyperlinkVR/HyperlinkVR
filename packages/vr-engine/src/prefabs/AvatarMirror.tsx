import { ColorPicker } from "../misc/ColorPicker";
import { SkinPalette } from "../misc/SkinPalette";
import { ReflectiveMirror } from "./ReflectiveMirror";
import { useAvatar } from "../contexts/AvatarContext";
import { ComponentProps } from "react";
import { useSetting } from "@hyperlinkvr/react";
import { PrefabRoot } from "./PrefabRoot";
import { PrefabProps } from "../types";

type Bases = Omit<ComponentProps<"group">, "position"> & PrefabProps;
interface AvatarMirrorProps extends Omit<Bases, "position"> {
    x_z_offset?: [number, number];
}

export const AvatarMirror = ({x_z_offset = [0, 0], ...props}: AvatarMirrorProps) => {
    const [avatar, setAvatar] = useAvatar();
    const [player_height_cm] = useSetting("player_height_cm");

    return (
        <PrefabRoot position={[x_z_offset[0], (player_height_cm / 100) / 4, x_z_offset[1]]}>
            <SkinPalette box_size={0.075} spacing={0.05} position={[0, 1.75, 0]}  />
            <ReflectiveMirror width={0.75} height={1.25} position={[0, 1, 0]} />
            <ColorPicker position={[2, 0.5, 0]} scale={[2, 2, 2]} color={avatar.hair_hex} on_color_change={(color) => {
                setAvatar((prev) => ({
                    ...prev,
                    hair_hex: color
                }));
            }} />

            <pointLight position={[0, 2, 0]} intensity={2} color={0xffffff} />
        </PrefabRoot>
    );
}
