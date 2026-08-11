import type { CreatedEngineObject } from "@hyperlinkvr/vr-engine-schemas";
import type { Group } from "three";


export enum Eye {
    Left = 0,
    Right = 1
}

export type RendererComponentProps<T extends CreatedEngineObject["object"]> = Omit<T, "type"> & {
    root_ref: React.RefObject<Group | null>;
    user_data_ref: React.RefObject<CreatedEngineObject["user_data"]>;
    id: CreatedEngineObject["id"];
    transform: CreatedEngineObject["transform"];
}

export type PrefabProps<T extends {type: "prefab", name: string}> = Omit<T, "type" | "name">;
