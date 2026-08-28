import { EffectPass } from "postprocessing";
import { SSGIEffect } from "realism-effects";

import { usePmndrsPass } from "../render/PmndrsCompat";

export const SSGIPass = () => {
    usePmndrsPass(
        (scene, camera) => new EffectPass(camera, new SSGIEffect(scene, camera))
    );
    return null;
};
