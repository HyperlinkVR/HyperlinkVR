import { ComponentProps } from "react";
import { Group } from "three";

import { usePublishObjectTags } from "../hooks/usePublishObjectTags";


type GroupProps = Pick<
    ComponentProps<"group">,
    "position" | "rotation" | "quaternion" | "scale" | "visible" | "name" | "userData"
>;


type PrefabRootProps = GroupProps & {
    ref?: React.Ref<Group | null>;
    tags?: string[];
    children?: React.ReactNode;
} & Record<string, unknown>;

const GROUP_PROP_KEYS = ["position", "rotation", "quaternion", "scale", "visible", "name", "userData"] as const;

// doesn't do too much special currently (except make tags more natural), but is a good place to add prefab-wide logic in the future
export const PrefabRoot = ({ ref, children, tags, ...rest }: PrefabRootProps) => {
    usePublishObjectTags(["prefab", ...(tags ?? [])]);

    const group_props: GroupProps = {};
    for (const key of GROUP_PROP_KEYS) {
        if (rest[key] !== undefined) (group_props as Record<string, unknown>)[key] = rest[key];
    }

    return (
        <group ref={ref} {...group_props}>
            {children}
        </group>
    );
};
