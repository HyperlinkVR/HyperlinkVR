import { KeyboardRenderer } from "@hyperlinkvr/ui-3d";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { Group, MathUtils } from "three";





export const KeyboardSlot = () => {
    const keyboard_group_ref = useRef<Group>(null);

    const { camera } = useThree();

    useFrame((_, delta) => {
        if (!keyboard_group_ref.current) return;

        const keyboard = keyboard_group_ref.current;
        const camera_pos = camera.position.clone();

        // position at waist-ish height, affecting only the y axis to retain the origin relative x/z position
        const target_y = camera_pos.y - 0.45;
        keyboard.position.y = MathUtils.damp(
            keyboard.position.y,
            target_y,
            1,
            delta
        );
    });

    return (
        <group ref={keyboard_group_ref}  position={[0, 0, -0.5]} rotation={[-Math.PI/4, 0, 0]}>
            <KeyboardRenderer pixelSize={0.001} />
        </group>
    );
};
