import { EffectPass } from "postprocessing";
import { SSGIEffect, VelocityDepthNormalPass } from "realism-effects";

import { usePmndrsPass } from "../render/PmndrsCompat";
import { useMemo } from "react";
import { useThree } from "@react-three/fiber";

export const SSGIPass = ({ options }: { options?: object }) => {
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);

    const vdn = useMemo(() => new VelocityDepthNormalPass(scene, camera), [scene, camera]);
    usePmndrsPass(() => vdn, [vdn]);

    usePmndrsPass(
        () => new EffectPass(camera as any, new SSGIEffect(scene, camera as any, vdn, options)),
        [scene, camera, vdn, options]
    );

    return null;
};