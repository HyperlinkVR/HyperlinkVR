import type {
    CreatedEngineObject,
    EngineObject
} from "@hyperlinkvr/vr-engine-schemas";
import type { Group } from "three";


export enum Eye {
    Left = 0,
    Right = 1
}

export interface RootProps {
    root_ref: React.RefObject<Group | null>;
    user_data_ref: React.RefObject<CreatedEngineObject["user_data"]>;
    id: CreatedEngineObject["id"];
}

interface RendererComponentPropsAdditional extends RootProps {
    transform: CreatedEngineObject["transform"];
}

export type RendererComponentProps<T extends EngineObject> = Omit<T, "type"> & RendererComponentPropsAdditional;


export type PrefabProps<T extends { type: "prefab"; name: string } = any> = Omit<
    T,
    "type" | "name" | "transform"
> & Partial<RootProps>;
