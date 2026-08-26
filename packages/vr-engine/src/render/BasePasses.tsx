import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
// import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";

import { PASS_ORDER, usePass } from "./GraphicsPipeline";


export const SceneRenderPass = ({ _index }: { _index?: number }) => {
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);

    const pass = useMemo(() => new RenderPass(scene, camera), [scene, camera]);

    usePass(pass, PASS_ORDER.render);
    return null;
};

// export const SRGBOutputPass = ({ _index }: { _index?: number }) => {
//     const pass = useMemo(() => new OutputPass(), []);
//     usePass(pass, PASS_ORDER.output);
//     return null;
// };
