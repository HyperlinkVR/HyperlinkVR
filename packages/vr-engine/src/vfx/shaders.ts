import type { VFXEffectType } from "@hyperlinkvr/vr-engine-schemas";
import { FilmShader } from "three/examples/jsm/shaders/FilmShader";
import { RGBShiftShader } from "three/examples/jsm/shaders/RGBShiftShader";


// matches three shader interface
export type RawShader = {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
};

const GrayscaleShader: RawShader = {
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

/**
 * @author Felix Turner / www.airtight.cc / @felixturner
 *
 * Bad TV Shader - Simulates a bad TV via horizontal distortion and vertical roll.
 * Uses Ashima WebGl Noise: https://github.com/ashima/webgl-noise
 * MIT License, Copyright (c) Felix Turner.
 */
const BadTVShader: RawShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        distortion: { value: 0.5 },
        distortion2: { value: 2.5 },
        speed: { value: 0.45 },
        rollSpeed: { value: 0 }
    },

    vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "vUv = uv;",
        "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
        "}"
    ].join("\n"),

    fragmentShader: [
        "uniform sampler2D tDiffuse;",
        "uniform float time;",
        "uniform float distortion;",
        "uniform float distortion2;",
        "uniform float speed;",
        "uniform float rollSpeed;",
        "varying vec2 vUv;",

        // Start Ashima 2D Simplex Noise

        "vec3 mod289(vec3 x) {",
        "  return x - floor(x * (1.0 / 289.0)) * 289.0;",
        "}",

        "vec2 mod289(vec2 x) {",
        "  return x - floor(x * (1.0 / 289.0)) * 289.0;",
        "}",

        "vec3 permute(vec3 x) {",
        "  return mod289(((x*34.0)+1.0)*x);",
        "}",

        "float snoise(vec2 v)",
        "  {",
        "  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0",
        "                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)",
        "                     -0.577350269189626,  // -1.0 + 2.0 * C.x",
        "                      0.024390243902439); // 1.0 / 41.0",
        "  vec2 i  = floor(v + dot(v, C.yy) );",
        "  vec2 x0 = v -   i + dot(i, C.xx);",

        "  vec2 i1;",
        "  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);",
        "  vec4 x12 = x0.xyxy + C.xxzz;",
        " x12.xy -= i1;",

        "  i = mod289(i); // Avoid truncation effects in permutation",
        "  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))",
        "		+ i.x + vec3(0.0, i1.x, 1.0 ));",

        "  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);",
        "  m = m*m ;",
        "  m = m*m ;",

        "  vec3 x = 2.0 * fract(p * C.www) - 1.0;",
        "  vec3 h = abs(x) - 0.5;",
        "  vec3 ox = floor(x + 0.5);",
        "  vec3 a0 = x - ox;",

        "  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );",

        "  vec3 g;",
        "  g.x  = a0.x  * x0.x  + h.x  * x0.y;",
        "  g.yz = a0.yz * x12.xz + h.yz * x12.yw;",
        "  return 130.0 * dot(m, g);",
        "}",

        // End Ashima 2D Simplex Noise

        "void main() {",

        "vec2 p = vUv;",
        "float ty = time*speed;",
        "float yt = p.y - ty;",
        //smooth distortion
        "float offset = snoise(vec2(yt*3.0,0.0))*0.2;",
        // boost distortion
        "offset = offset*distortion * offset*distortion * offset;",
        //add fine grain distortion
        "offset += snoise(vec2(yt*50.0,0.0))*distortion2*0.001;",
        //combine distortion on X with roll on Y
        "gl_FragColor = texture2D(tDiffuse,  vec2(fract(p.x + offset),fract(p.y-time*rollSpeed) ));",

        "}"
    ].join("\n")
};

/**
 * @author Felix Turner / www.airtight.cc / @felixturner
 *
 * Static effect - additively blended digital noise.
 * MIT License, Copyright (c) 2014 Felix Turner.
 */
const StaticShader: RawShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        amount: { value: 0.03 },
        size: { value: 4.0 }
    },

    vertexShader: [
        "varying vec2 vUv;",

        "void main() {",

        "vUv = uv;",
        "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

        "}"
    ].join("\n"),

    fragmentShader: [
        "uniform sampler2D tDiffuse;",
        "uniform float time;",
        "uniform float amount;",
        "uniform float size;",

        "varying vec2 vUv;",

        "float rand(vec2 co){",
        "return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);",
        "}",

        "void main() {",
        "vec2 p = vUv;",
        "vec4 color = texture2D(tDiffuse, p);",
        "float xs = floor(gl_FragCoord.x / size);",
        "float ys = floor(gl_FragCoord.y / size);",
        "vec4 snow = vec4(rand(vec2(xs * time,ys * time))*amount);",

        "gl_FragColor = color+ snow;", //additive

        "}"
    ].join("\n")
};

const ScreenShakeShader: RawShader = {
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

                // Vertical clamp to prevent wrapping artifacts
                uv.y = clamp(uv.y, 0.0, 1.0);
            }

            gl_FragColor = texture2D(tDiffuse, uv);
        }
    `
};

// TODO: implement vr friendly screen shake https://www.zulubo.com/blog/vr-screen-shake

export const VFX_SHADERS: Record<VFXEffectType, RawShader> = {
    "grayscale": GrayscaleShader,
    "rgb-shift": RGBShiftShader,
    "bad-tv": BadTVShader,
    "static": StaticShader,
    "film": FilmShader,
    "screen-shake": ScreenShakeShader
};
