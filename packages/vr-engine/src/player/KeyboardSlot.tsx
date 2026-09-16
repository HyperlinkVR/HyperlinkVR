import { KeyboardRenderer } from "@hyperlinkvr/ui-3d";
import { useFrame, useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import { useRef } from "react";
import { Group } from "three";

export const KeyboardSlot = () => {
    const keyboard_group_ref = useRef<Group>(null);

    const { camera } = useThree();

    useFrame(() => {
        if (!keyboard_group_ref.current) return;

        const keyboard = keyboard_group_ref.current;
        const camera_pos = camera.position.clone();

        // position at waist-ish height, affecting only the y axis to retain the origin relative x/z position
        const target_pos = camera_pos.y - 0.45;
        keyboard.position.y += (target_pos - keyboard.position.y) * 0.1; // lerp
    });

    return (
        <group ref={keyboard_group_ref}  position={[0, 0, -0.5]} rotation={[-Math.PI/4, 0, 0]}>
            <Container pixelSize={0.001}>
                <KeyboardRenderer />
            </Container>
        </group>
    );
};
