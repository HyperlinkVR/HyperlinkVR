import { useFrame, useThree } from "@react-three/fiber";
import type { RefObject} from "react";
import { useMemo } from "react";
import type { Group} from "three";
import { Vector3 } from "three";

import { useFlatFrameInput } from "./bindings";
import {SPRINT_SPEED, WALK_SPEED} from "../../values";
import {request_player_movement} from "../../../player/motion";

export const FlatLocomotion = ({ origin }: { origin: RefObject<Group | null> }) => {
    const { camera } = useThree();

    const input = useFlatFrameInput();
    const fwd = useMemo(() => new Vector3(), []);
    const right = useMemo(() => new Vector3(), []);
    const displacement = useMemo(() => new Vector3(), []);

    // TODO: context for this so sdk can set
    const can_sprint = true;

    useFrame((_s, delta) => {
        const o = origin.current;
        if (!o || (input.move.x === 0 && input.move.y === 0)) return;
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        right.crossVectors(fwd, o.up).normalize();

        const speed = can_sprint && input.sprint ? SPRINT_SPEED : WALK_SPEED;

        displacement
            .set(0, 0, 0)
            .addScaledVector(fwd, input.move.y * speed * delta)
            .addScaledVector(right, input.move.x * speed * delta);

        const delta_x = displacement.x;
        const delta_z = displacement.z;
        request_player_movement(delta_x, delta_z);
    });

    return null;
};
