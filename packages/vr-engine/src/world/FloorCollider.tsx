import { CuboidCollider, interactionGroups, RigidBody } from "@react-three/rapier";
import { GROUP_PLAYER, GROUP_PROP, GROUP_WORLD } from "../physics/collision_groups";

export const FloorCollider = ({ height = 0, size = 1000, thickness = 0.2 }) => {
    return (
        <RigidBody type="fixed">
            <CuboidCollider
                args={[size, thickness / 2, size]}
                position={[0, height - thickness / 2, 0]}
                collisionGroups={interactionGroups(GROUP_WORLD, [GROUP_PLAYER, GROUP_PROP])}
            />
        </RigidBody>
    );
}
