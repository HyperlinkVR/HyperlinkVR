import {
    EngineObjectOfType,
    EngineObjectType
} from "@hyperlinkvr/vr-engine-schemas";

import { RendererComponentProps } from "../types";
import { PrefabRenderer } from "./PrefabRenderer";
import { CustomObjectRenderer } from "./CustomObjectRenderer";
import { ObjectCollectionRenderer } from "./ObjectCollectionRenderer";


export const RENDERERS: {
    [K in EngineObjectType]: React.ComponentType<
        RendererComponentProps<EngineObjectOfType<K>>
    >;
} = {
    prefab: PrefabRenderer,
    custom: CustomObjectRenderer,
    collection: ObjectCollectionRenderer
};
