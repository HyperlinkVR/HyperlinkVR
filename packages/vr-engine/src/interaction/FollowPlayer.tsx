import { useFrame } from "@react-three/fiber";
import type { ComponentProps} from "react";
import { useImperativeHandle, useRef } from "react";
import type { Group, Object3D } from "three";
import { Matrix4 } from "three";

import { usePlayerOrigin } from "../contexts";

const _tmp = new Matrix4();

const origin_as_local = (g: Object3D, originWorld: Matrix4): Matrix4 => {
    if (!g.parent) return _tmp.copy(originWorld);
    g.parent.updateWorldMatrix(true, false);
    return _tmp.copy(g.parent.matrixWorld).invert().multiply(originWorld);
};

// TODO: give sdk option of billboard positioning, as separate interaction probably but could be combined here

interface FollowPlayerProps extends ComponentProps<"group"> {
    ref?: React.Ref<Group | null>;
    enabled?: boolean;

    // false (default): detaching freezes in place -> no snap
    // true: detaching returns to the authored position/rotation in world space
    snap_on_release?: boolean;
}

export const FollowPlayer = ({
    ref = null,
    enabled = true,
    snap_on_release = false,
    children,
    ...rest
}: FollowPlayerProps) => {
    const origin = usePlayerOrigin();

    const frame_ref = useRef<Group>(null);
    const offset_ref = useRef<Group>(null);
    const was_enabled = useRef(enabled);
    useImperativeHandle(ref, () => offset_ref.current!);

    useFrame(() => {
        const g = frame_ref.current;
        if (!g) return;

        if (enabled && origin?.current) {
            origin.current.updateWorldMatrix(true, false);
            g.matrixAutoUpdate = false;            // we drive the frame directly
            g.matrix.copy(origin_as_local(g, origin.current.matrixWorld));
            g.matrixWorldNeedsUpdate = true;
            was_enabled.current = true;
        } else {
            // just detached
            if (was_enabled.current && snap_on_release) {
                // hand the frame back to identity -> child sits at authored offset in world
                g.matrixAutoUpdate = true;
                g.position.set(0, 0, 0);
                g.quaternion.identity();
                g.scale.set(1, 1, 1);
            }
            // else: leave matrix + matrixAutoUpdate exactly as they are -> frozen, no snap
            was_enabled.current = false;
        }
    });

    return (
        <group ref={frame_ref}>
            <group ref={offset_ref} {...rest}>
                {children}
            </group>
        </group>
    );
};
