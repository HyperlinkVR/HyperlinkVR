import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";



import { usePass } from "../render/GraphicsPipeline";


const ScreenShakeShader = {
    uniforms: {
        tDiffuse: { value: null },
        u_time: { value: 0.0 },
        u_magnitude: { value: 0.0 }
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
        uniform float u_time;
        uniform float u_magnitude;
        varying vec2 vUv;

        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
            vec2 uv = vUv;

            if (u_magnitude > 0.0) {
                // Calculate identical offsets for BOTH eyes to maintain stereo depth
                float dx = (random(vec2(u_time, 2.0)) - 0.5) * u_magnitude;
                float dy = (random(vec2(u_time, 3.0)) - 0.5) * u_magnitude;

                uv.x += dx;
                uv.y += dy;

                // --- VR SBS PROTECTION ---
                if (vUv.x < 0.5) {
                    // Left Eye: Never allow sampling past the center line
                    uv.x = clamp(uv.x, 0.0, 0.499);
                } else {
                    // Right Eye: Never allow sampling below the center line
                    uv.x = clamp(uv.x, 0.501, 1.0);
                }
                
                // Vertical clamp to prevent wrapping artifacts
                uv.y = clamp(uv.y, 0.0, 1.0);
            }

            gl_FragColor = texture2D(tDiffuse, uv);
        }
    `
};

let shake_magnitude = 0;
export const trigger_shake = (mag = 0.05) => {
    shake_magnitude = mag;
};

export const ScreenShakePass = () => {
    const pass = useMemo(() => new ShaderPass(ScreenShakeShader), []);
    usePass(pass);

    useFrame((state) => {
        pass.uniforms.u_time.value = state.clock.elapsedTime;

        if (shake_magnitude > 0) {
            shake_magnitude *= 0.9;
            pass.enabled = true;

            if (shake_magnitude < 0.001) {
                shake_magnitude = 0;
                pass.enabled = false;
            }
        } else {
            pass.enabled = false;
        }

        pass.uniforms.u_magnitude.value = shake_magnitude;
    });

    return null;
};

// TODO: use different screen shake shader in vr, port https://www.zulubo.com/blog/vr-screen-shake