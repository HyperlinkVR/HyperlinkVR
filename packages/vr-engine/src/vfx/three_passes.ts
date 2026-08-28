import type {
    VFXThreeEffectType
} from "@hyperlinkvr/vr-engine-schemas";
import type { Pass as ThreePass } from "three/examples/jsm/postprocessing/Pass";

import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { Vector2 } from "three";

type VFXThreePassConstructor = (values: Record<string, number>) => ThreePass;

export const VFX_THREE_PASSES: Record<VFXThreeEffectType, VFXThreePassConstructor> = {
    "bloom": (values) => {
        // TODO: configurable res from user settings (based on some effects quality setting)
        return new UnrealBloomPass(new Vector2(512, 512), values.strength ?? 1, values.radius ?? 0.5, values.threshold ?? 0.8);
    }
}
