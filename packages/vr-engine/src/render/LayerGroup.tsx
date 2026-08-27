import { useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";



import type { Layer } from "./layers";
import { compute_layer_mask } from "./layers";


interface LayerGroupProps extends Omit<React.ComponentPropsWithoutRef<"group">, "layers"> {
    layers: Layer[];
    children: React.ReactNode;
    ref?: React.Ref<Group | null>;
}

export const LayerGroup = ({
    layers,
    children,
    ref = null,
    ...group_props
}: LayerGroupProps) => {
    const group_ref = useRef<Group>(null);

    // forward group_ref to group_props.ref
    useImperativeHandle(ref, () => group_ref.current!, []);

    const layers_hash = layers.join(",");
    const layer_mask = useMemo(() => compute_layer_mask(layers), [layers_hash]);

    const previous_state_hash = useRef<string>("");

    useLayoutEffect(() => {
        if (group_ref.current) {
            // determine if a child actually changed (removed/added, not just re-renders)
            // could just apply differentially to changed children, but its probably more efficient to just do the layer set each time (2 bitwise ops vs a set lookup for each node)
            let uuids = "";
            group_ref.current.traverse((child) => {
                uuids += child.uuid;
            });

            const state_hash = `${uuids}|${layer_mask}`;

            if (state_hash !== previous_state_hash.current) {
                previous_state_hash.current = state_hash;

                group_ref.current.traverse((child) => {
                    // apply the layers to each child object in the group
                    child.layers.mask = layer_mask;
                });
            }
        }
    }, [layer_mask, children]);

    return <group ref={group_ref} {...group_props}>{children}</group>;
};
