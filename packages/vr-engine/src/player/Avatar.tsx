import { useSetting } from "@hyperlinkvr/react";

import { AvatarHead } from "./AvatarHead";
import { AvatarTorso } from "./AvatarTorso";


export const Avatar = () => {
    const [devtools_photo_mode] = useSetting("devtools_flat_photo_mode");
    if (devtools_photo_mode) return null;

    return (
        <group name="Avatar">
            <AvatarHead />
            <AvatarTorso />
        </group>
    );
};

// TODO: bounce torso and head on walk (only visually)
// TODO: visual wind effect on sprint (definitely flat, maybe in vr?)
