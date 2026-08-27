import { useFrame } from "@react-three/fiber";
import type { ComponentProps} from "react";
import { useImperativeHandle, useRef } from "react";
import type { Group} from "three";
import { Euler, Vector3 } from "three";


const _cam = new Vector3();
const _e = new Euler();

interface EnhancedBillboardProps extends ComponentProps<"group"> {
    ref?: React.Ref<Group | null>;

    lock_x?: boolean;
    lock_y?: boolean;
    lock_z?: boolean;
}

export const EnhancedBillboard = ({ ref = null, lock_x = false, lock_y = false, lock_z = false, children, ...rest }: EnhancedBillboardProps) => {
    const group_ref = useRef<Group>(null);
    useImperativeHandle(ref, () => group_ref.current!);

    useFrame(({ camera }) => {
        const g = group_ref.current;
        if (!g) return;

        camera.getWorldPosition(_cam);
        g.lookAt(_cam);

        _e.setFromQuaternion(g.quaternion, "YXZ");
        if (lock_x) _e.x = 0;
        if (lock_y) _e.y = 0;
        if (lock_z) _e.z = 0;
        g.quaternion.setFromEuler(_e);
    });

    return <group ref={group_ref} {...rest}>{children}</group>;
}
