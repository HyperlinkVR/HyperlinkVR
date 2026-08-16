import {Object3D} from "three";

export const collect_tags = (start: Object3D | null): string[] => {
    const tags = new Set<string>();
    let node: Object3D | null = start;

    while (node) {
        const node_tags = node.userData?.tags as string[] | undefined;
        if (node_tags) {
            for (const tag of node_tags) tags.add(tag);
        }

        // the object root carries object_id, so we can stop traversing once we reach it
        if (typeof node.userData?.object_id === "string") break;

        node = node.parent;
    }

    return [...tags];
};

export const has_tag_in_object_tree = (start: Object3D | null, tag: string): boolean =>
    collect_tags(start).includes(tag);
