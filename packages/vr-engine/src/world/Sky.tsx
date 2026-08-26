import { WorldSky } from "@hyperlinkvr/vr-engine-schemas";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, Color, CubeCamera, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3, WebGLCubeRenderTarget, type ColorRepresentation, type Texture, type WebGLRenderTarget } from "three";

import { useShadowMapSize } from "../render";


type Vec3Like = Vector3 | [number, number, number];

const VERTEX = `
varying vec3 v_dir;
void main() {
    // sphere is centred at the origin, so the vertex position *is* the
    // view direction for that texel of the cube map.
    v_dir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec3 v_dir;
 
uniform vec3  u_sky_zenith;
uniform vec3  u_sky_horizon;
uniform vec3  u_ground_horizon;
uniform vec3  u_ground_nadir;
 
uniform vec3  u_sun_dir;
uniform vec3  u_sun_color;
uniform float u_sun_intensity;
uniform float u_sun_size;   // degrees
uniform float u_sun_glow;   // degrees
 
uniform float u_sharpness;
uniform float u_band;
 
void main() {
    vec3 dir = normalize(v_dir);
    float y = dir.y; // -1 (down) .. +1 (up)
 
    vec3 sky = mix(
        u_sky_horizon, u_sky_zenith,
        pow(clamp(y, 0.0, 1.0), u_sharpness)
    );
    vec3 ground = mix(
        u_ground_horizon, u_ground_nadir,
        pow(clamp(-y, 0.0, 1.0), u_sharpness)
    );
 
    // soft blend across the horizon seam so sky/ground horizon colours meet
    float h = smoothstep(-u_band, u_band, y);
    vec3 col = mix(ground, sky, h);
 
    // sun
    float cd = dot(dir, normalize(u_sun_dir));
    float ang = degrees(acos(clamp(cd, -1.0, 1.0)));
    float disc = 1.0 - smoothstep(u_sun_size, u_sun_size + u_sun_glow, ang);
    float halo = pow(clamp(1.0 - ang / (u_sun_size + u_sun_glow * 6.0), 0.0, 1.0), 3.0);
    col += u_sun_color * u_sun_intensity * (disc + 0.25 * halo);
 
    gl_FragColor = vec4(col, 1.0);
}`;

const srgb_vec3 = (c: ColorRepresentation): Vector3 => {
    const col = new Color(c);
    const out = { r: 0, g: 0, b: 0 };
    col.getRGB(out, SRGBColorSpace);
    return new Vector3(out.r, out.g, out.b);
};

const as_vector3 = (v: Vec3Like): Vector3 =>
    Array.isArray(v) ? new Vector3(v[0], v[1], v[2]) : v.clone();

const RESOLUTION = 1024;

export const Sky = ({
    sky_zenith_color = "#2a6cd6",
    sky_horizon_color = "#bfe0ff",
    ground_horizon_color = "#9aa7a0",
    ground_nadir_color = "#37433d",
    sun_direction = [0.3, 0.6, 0.2],
    sun_color = "#fff6e0",
    sun_intensity = 1.0,
    sun_size = 3,
    sun_glow = 6,
    horizon_sharpness = 1.0,
    horizon_band = 0.02,
    cast_light = true,
    light_intensity = 1.0,
    light_distance = 50,
    sky_light_intensity = 0.5,
    ambient_override_color,
    ambient_override_intensity = 0.25
}: WorldSky) => {
    const { gl, scene } = useThree();

    // uniforms changed in place
    const uniforms = useMemo(
        () => ({
            u_sky_zenith: { value: new Vector3() },
            u_sky_horizon: { value: new Vector3() },
            u_ground_horizon: { value: new Vector3() },
            u_ground_nadir: { value: new Vector3() },
            u_sun_dir: { value: new Vector3() },
            u_sun_color: { value: new Vector3() },
            u_sun_intensity: { value: 1 },
            u_sun_size: { value: 3 },
            u_sun_glow: { value: 6 },
            u_sharpness: { value: 1 },
            u_band: { value: 0.02 }
        }),
        []
    );

    // scene for baking
    const { sky_scene, cube_camera, cube_rt, material, geometry } =
        useMemo(() => {
            const rt = new WebGLCubeRenderTarget(RESOLUTION, {
                generateMipmaps: false
            });
            rt.texture.colorSpace = SRGBColorSpace;

            const mat = new ShaderMaterial({
                uniforms,
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                side: BackSide,
                depthWrite: false,
                depthTest: false,
                toneMapped: false
            });

            const geo = new SphereGeometry(1, 32, 16);
            const mesh = new Mesh(geo, mat);
            const s = new Scene();
            s.add(mesh);

            const cam = new CubeCamera(0.1, 10, rt);
            s.add(cam);

            return {
                sky_scene: s,
                cube_camera: cam,
                cube_rt: rt,
                material: mat,
                geometry: geo
            };
        }, [RESOLUTION, uniforms]);

    const pmrem = useMemo(() => new PMREMGenerator(gl), [gl]);
    const env_rt_ref = useRef<WebGLRenderTarget | null>(null);
    const prev_env_ref = useRef<Texture | null>(null);

    const needs_bake = useRef(true);

    // push sky params to uniforms, then flag a re-bake
    useEffect(() => {
        uniforms.u_sky_zenith.value.copy(srgb_vec3(sky_zenith_color));
        uniforms.u_sky_horizon.value.copy(srgb_vec3(sky_horizon_color));
        uniforms.u_ground_horizon.value.copy(srgb_vec3(ground_horizon_color));
        uniforms.u_ground_nadir.value.copy(srgb_vec3(ground_nadir_color));
        uniforms.u_sun_dir.value.copy(as_vector3(sun_direction).normalize());
        uniforms.u_sun_color.value.copy(srgb_vec3(sun_color));
        uniforms.u_sun_intensity.value = sun_intensity;
        uniforms.u_sun_size.value = sun_size;
        uniforms.u_sun_glow.value = sun_glow;
        uniforms.u_sharpness.value = horizon_sharpness;
        uniforms.u_band.value = horizon_band;
        needs_bake.current = true;
    }, [
        uniforms,
        sky_zenith_color,
        sky_horizon_color,
        ground_horizon_color,
        ground_nadir_color,
        sun_direction,
        sun_color,
        sun_intensity,
        sun_size,
        sun_glow,
        horizon_sharpness,
        horizon_band
    ]);

    // this replaces scene.background with the baked sky cube map, and restores it on unmount.
    useEffect(() => {
        const prev = scene.background;
        scene.background = cube_rt.texture;
        return () => {
            scene.background = prev;
        };
    }, [scene, cube_rt]);

    useEffect(() => {
        prev_env_ref.current = scene.environment;
        return () => {
            scene.environment = prev_env_ref.current;
            env_rt_ref.current?.dispose();
            env_rt_ref.current = null;
        };
    }, [scene]);

    // keep environment intensity in sync
    useEffect(() => {
        (
            scene as unknown as { environmentIntensity: number }
        ).environmentIntensity = sky_light_intensity;
    }, [scene, sky_light_intensity]);

    useEffect(
        () => () => {
            cube_rt.dispose();
            material.dispose();
            geometry.dispose();
            pmrem.dispose();
        },
        [cube_rt, material, geometry, pmrem]
    );

    // bake the sky into the cube render target, then PMREM it into an environment map, only when needed
    useFrame(() => {
        if (!needs_bake.current) return;
        needs_bake.current = false;

        const prev_rt = gl.getRenderTarget();
        const prev_xr = gl.xr.enabled;
        gl.xr.enabled = false;

        cube_camera.update(gl, sky_scene);

        const rt = pmrem.fromCubemap(
            cube_rt.texture,
            env_rt_ref.current ?? undefined
        );
        env_rt_ref.current = rt;
        scene.environment = rt.texture;

        gl.xr.enabled = prev_xr;
        gl.setRenderTarget(prev_rt);
    });

    const sun_pos = useMemo(
        () =>
            as_vector3(sun_direction)
                .normalize()
                .multiplyScalar(light_distance),
        [sun_direction, light_distance]
    );

    const map_size = useShadowMapSize();

    // TODO: compute bounds of scene to set shadow camera bounds dynamically, instead of hardcoding to 50m (which has quality sacrifice)

    return (
        <>
            {cast_light && (
                <directionalLight
                    key={map_size || "none"}

                    position={[sun_pos.x, sun_pos.y, sun_pos.z]}
                    color={sun_color}
                    intensity={light_intensity}

                    castShadow
                    shadow-mapSize={map_size}
                    shadow-camera-top={50}
                    shadow-camera-bottom={-50}
                    shadow-camera-left={-50}
                    shadow-camera-right={50}

                    shadow-camera-near={10}
                    shadow-camera-far={light_distance + 50}

                    shadow-normalBias={0.02}
                    shadow-bias={-0.001}
                />
            )}

            {ambient_override_color != null && (
                <ambientLight
                    color={ambient_override_color}
                    intensity={ambient_override_intensity}
                />
            )}
        </>
    );
};
