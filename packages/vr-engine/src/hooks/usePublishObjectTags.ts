import { useLayoutEffect } from "react";

import { useObjectRefsOptional } from "../contexts/ObjectRefsContext";
import { recompute_object_tags } from "../util/tags";

// allows prefabs and other sub objects to publish tags to the root object
export const usePublishObjectTags = (tags: string[] | undefined) => {
    const refs = useObjectRefsOptional();
    const key = tags?.join(",");

    useLayoutEffect(() => {
        if (!refs || !tags?.length) return;

        const user_data = refs.user_data;
        const contributed: Set<string> =
            user_data.__contributed_tags ?? (user_data.__contributed_tags = new Set<string>());

        for (const tag of tags) contributed.add(tag);
        recompute_object_tags(user_data);

        return () => {
            for (const tag of tags) contributed.delete(tag);
            recompute_object_tags(user_data);
        };
    }, [refs, key]);
};
