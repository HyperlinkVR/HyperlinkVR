import type { Prefab } from "@hyperlinkvr/vr-engine-schemas";
import prefabs from "../prefabs";
import { useMemo } from "react";
import type { RendererComponentProps } from "../types";

export const PrefabRenderer = (props: RendererComponentProps<Prefab>)=> {
    // data.tags is already published onto the object root by EngineObjectRenderer (__base_tags), so don't forward it to the prefab
    // this reduces the risk of accidentally overwriting the prefab's own tags with the engine object's tags
    const { name, tags: _forwarded_tags, ...rest } = props;

    const PrefabComponent = useMemo(() => prefabs[name], [name]);
    if (!PrefabComponent) {
        console.warn(`Prefab "${name}" not found.`);
        return null;
    }

    return <PrefabComponent {...(rest as any)} />;
}
