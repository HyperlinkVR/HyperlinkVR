import type { ThreeElements } from "@react-three/fiber";

import { useShadowMapSize } from "./useShadowMapSize";


const SHADOW_NORMAL_BIAS = 0.02;
const SHADOW_BIAS = -0.001;
const SHADOW_NEAR = 0.5;
const DEFAULT_SHADOW_FAR = 100;


export type ShadowPointLightProps = ThreeElements["pointLight"];

export const ShadowPointLight = ({
    castShadow = true,
    distance,
    ref,
    ...props
}: ShadowPointLightProps) => {
    const map_size = useShadowMapSize();
    return (
        <pointLight
            key={castShadow ? (map_size ?? "default") : "no-shadow"}
            ref={ref}
            castShadow={castShadow}
            distance={distance}
            shadow-mapSize={map_size}
            shadow-camera-near={SHADOW_NEAR}
            shadow-camera-far={distance || DEFAULT_SHADOW_FAR}
            shadow-normalBias={SHADOW_NORMAL_BIAS}
            shadow-bias={SHADOW_BIAS}
            {...props}
        />
    );
};

export type ShadowSpotLightProps = ThreeElements["spotLight"];

export const ShadowSpotLight = ({
    castShadow = true,
    distance,
    ref,
    ...props
}: ShadowSpotLightProps) => {
    const map_size = useShadowMapSize();
    return (
        <spotLight
            key={castShadow ? (map_size ?? "default") : "no-shadow"}
            ref={ref}
            castShadow={castShadow}
            distance={distance}
            // spot shadow camera fov tracks the cone angle automatically
            shadow-mapSize={map_size}
            shadow-camera-near={SHADOW_NEAR}
            shadow-camera-far={distance || DEFAULT_SHADOW_FAR}
            shadow-normalBias={SHADOW_NORMAL_BIAS}
            shadow-bias={SHADOW_BIAS}
            {...props}
        />
    );
};

export type ShadowDirectionalLightProps = ThreeElements["directionalLight"] & {
    // half-extent (metres) of the orthographic shadow frustum centred on the light
    shadow_area?: number;
};

export const ShadowDirectionalLight = ({
    castShadow = true,
    shadow_area = 30,
    ref,
    ...props
}: ShadowDirectionalLightProps) => {
    const map_size = useShadowMapSize();
    return (
        <directionalLight
            key={castShadow ? `${map_size ?? "default"}:${shadow_area}` : "no-shadow"}
            ref={ref}
            castShadow={castShadow}
            shadow-mapSize={map_size}
            shadow-camera-top={shadow_area}
            shadow-camera-bottom={-shadow_area}
            shadow-camera-left={-shadow_area}
            shadow-camera-right={shadow_area}
            shadow-camera-near={SHADOW_NEAR}
            shadow-camera-far={shadow_area * 4}
            shadow-normalBias={SHADOW_NORMAL_BIAS}
            shadow-bias={SHADOW_BIAS}
            {...props}
        />
    );
};
