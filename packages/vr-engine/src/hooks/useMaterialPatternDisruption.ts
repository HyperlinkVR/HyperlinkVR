import type { Material, Texture} from "three";
import { Color, RepeatWrapping, Vector3 } from "three";
import { useLayoutEffect } from "react";
import { useTexture } from "@react-three/drei";

const inject_shader = (
    noise_map: Texture,
    noise_scale: number = 0.03,
    contrast: number = 4.0,
    brightness: number = 0.0,
    offset_strength: number = 4.0,
    cross_axis_factor: number = 0.1,
    mean_color: Vector3 = new Vector3(0.45, 0.32, 0.2),
    plank_mode: boolean = false,
    planks_vertical: boolean = false
) => (shader: any) => {
    shader.uniforms.tNoise = { value: noise_map };
    shader.uniforms.uNoiseScale = { value: noise_scale };
    shader.uniforms.uNoiseContrast = { value: contrast };
    shader.uniforms.uNoiseBrightness = { value: brightness };
    shader.uniforms.uOffsetStrength = { value: offset_strength };
    shader.uniforms.uCrossAxisFactor = { value: cross_axis_factor };
    shader.uniforms.uMeanColor = { value: mean_color };
    shader.uniforms.uPlankMode = { value: plank_mode ? 1.0 : 0.0 };
    shader.uniforms.uNoiseAxis = { value: planks_vertical ? 1.0 : 0.0 };

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform sampler2D tNoise;
        uniform float uNoiseScale;
        uniform float uNoiseContrast;
        uniform float uNoiseBrightness;
        uniform float uOffsetStrength;
        uniform float uCrossAxisFactor;
        uniform vec3 uMeanColor;
        uniform float uPlankMode;
        uniform float uNoiseAxis;
        `
    )

    const map_replacement = `
    #ifdef USE_MAP
        // derivatives from the UNOFFSET uvs, or the gpu picks an over-blurred mip
        // once the offset starts varying per-pixel
        vec2 duv_dx = dFdx(vMapUv);
        vec2 duv_dy = dFdy(vMapUv);

        // low-frequency noise: whole regions shift together, which is what actually
        // destroys the tiling grid. high-frequency noise just smears the texture.
        float noise_x = texture2D(tNoise, vMapUv * uNoiseScale).r;
        float noise_y = texture2D(tNoise, vMapUv * uNoiseScale + vec2(0.37, 0.71)).r;

        vec2 slide_dir = mix(vec2(1.0, 0.0), vec2(0.0, 1.0), uNoiseAxis);
        vec2 cross_dir = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), uNoiseAxis);

        // in plank mode the offset runs mostly ALONG the boards (grain is uniform
        // there, so it's invisible), with a small cross-axis component. without any
        // cross-axis shift the knot rows stay perfectly periodic across the floor;
        // with too much, the plank seams smear into mush. keep this factor small.
        vec2 offset = uPlankMode > 0.5
            ? slide_dir * (noise_x - 0.5) * uOffsetStrength
              + cross_dir * (noise_y - 0.5) * uOffsetStrength * uCrossAxisFactor
            : (vec2(noise_x, noise_y) - 0.5) * uOffsetStrength;

        vec4 color_a = textureGrad(map, vMapUv, duv_dx, duv_dy);
        vec4 color_b = textureGrad(map, vMapUv + offset, duv_dx, duv_dy);

        // blend mask from a third, decorrelated noise sample so the blend seams
        // don't line up with the offset regions. high contrast pushes the mask to
        // 0 or 1 across most of the surface, so most fragments are a single clean
        // sample rather than a 50/50 average (which is what looks blurry).
        float raw_mask = texture2D(tNoise, vMapUv * uNoiseScale * 1.7 + vec2(0.13, 0.59)).r;
        float mask = clamp((raw_mask + uNoiseBrightness - 0.5) * uNoiseContrast + 0.5, 0.0, 1.0);

        // variance-preserving blend (Heitz & Neyret): naively averaging two samples
        // halves the variance, which reads as lost contrast / blur. blending in a
        // mean-centred space and rescaling by the weights' L2 norm restores it.
        vec3 centred_a = color_a.rgb - uMeanColor;
        vec3 centred_b = color_b.rgb - uMeanColor;
        vec3 blended = mix(centred_a, centred_b, mask);

        float weight_norm = sqrt(mask * mask + (1.0 - mask) * (1.0 - mask));
        blended = blended / max(weight_norm, 0.001) + uMeanColor;

        diffuseColor *= mix(color_a, color_b, mask);
    #endif
`;

    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", map_replacement);
}

const noise_map_url = new URL("../../assets/perlin_256.png", import.meta.url).href;

export const useMaterialPatternDisruptor = (materials: Record<string, Material> | undefined) => {
    const noise_map = useTexture(noise_map_url);

    useLayoutEffect(() => {
        if (!materials || !noise_map) return;

        noise_map.wrapS = RepeatWrapping;
        noise_map.wrapT = RepeatWrapping;

        Object.values(materials).forEach((material) => {
            const user_data = material.userData || {};
            const needs_disruption = user_data.disrupt_pattern === true || user_data.disrupt_pattern === 1;

            if (!needs_disruption) return;

            // low: the noise must vary slowly across many tiles
            const noise_scale = typeof user_data.noise_scale === "number" ? user_data.noise_scale : 0.03;

            // high: pushes the blend mask to 0/1, so most fragments are one clean sample
            const contrast = typeof user_data.noise_contrast === "number" ? user_data.noise_contrast : 4.0;

            const brightness = typeof user_data.noise_brightness === "number" ? user_data.noise_brightness : 0.0;

            // in texture repeats. needs to be large enough to move a knot out of its row
            const offset_strength = typeof user_data.offset_strength === "number" ? user_data.offset_strength : 4.0;

            // fraction of offset_strength applied perpendicular to the planks
            const cross_axis_factor = typeof user_data.cross_axis_factor === "number" ? user_data.cross_axis_factor : 0.1;

            const plank_mode = user_data.plank_mode === true || user_data.plank_mode === 1;
            const planks_vertical = user_data.planks_vertical === true || user_data.planks_vertical === 1;

            // average colour of the texture, for the variance-preserving blend.
            // eyedrop it from a zoomed-out view of the texture in blender.
            const mean_color = new Vector3(0.45, 0.32, 0.2);
            if (typeof user_data.mean_color === "string") {
                const parsed = new Color(user_data.mean_color);
                mean_color.set(parsed.r, parsed.g, parsed.b);
            }

            material.onBeforeCompile = inject_shader(
                noise_map,
                noise_scale,
                contrast,
                brightness,
                offset_strength,
                cross_axis_factor,
                mean_color,
                plank_mode,
                planks_vertical
            );

            (material as any).customProgramCacheKey = () =>
                `variance-${material.uuid}-${noise_scale}-${contrast}-${brightness}-${offset_strength}-${cross_axis_factor}-${plank_mode}-${planks_vertical}`;

            material.needsUpdate = true;
        })
    }, [materials, noise_map]);
}
