import { useMemo, useEffect } from "react";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import {usePass} from "../render/GraphicsPipeline";

const GrayscaleShader = {
    uniforms: {
        tDiffuse: { value: null }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            // Standard perceptual luminance weights
            float gray = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
            gl_FragColor = vec4(vec3(gray), texel.a);
        }
    `
};

export const GrayscalePass = ({ enabled = true }: { enabled?: boolean }) => {
    const pass = useMemo(() => new ShaderPass(GrayscaleShader), []);
    usePass(pass);

    useEffect(() => {
        pass.enabled = enabled;
    }, [pass, enabled]);

    return null;
};
