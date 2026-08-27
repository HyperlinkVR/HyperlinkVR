import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import type { Material, MeshPhysicalMaterial,
    Object3D} from "three";
import {
    Color,
    DataTexture,
    DepthTexture, DoubleSide,
    FloatType,
    LinearFilter,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MultiplyBlending,
    NearestFilter,
    OrthographicCamera,
    PerspectiveCamera,
    PlaneGeometry,
    RepeatWrapping,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    UnsignedIntType,
    Vector2,
    Vector3,
    Vector4,
    WebGLRenderTarget
} from "three";

import {compute_layer_mask, Layer} from "./layers";

const fullscreen_vertex = /* glsl */ `
varying vec2 v_uv;
void main() {
    v_uv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Hemisphere-kernel SSAO. Depth texture contains both eyes side by side;
// u_uv_offset/u_uv_scale map this eye's local 0..1 uv into that atlas.
const ao_fragment = /* glsl */ `
uniform sampler2D t_depth;
uniform sampler2D t_noise;
uniform mat4 u_projection;
uniform mat4 u_projection_inverse;
uniform vec3 u_kernel[SAMPLE_COUNT];
uniform vec2 u_uv_offset;
uniform vec2 u_uv_scale;
uniform vec2 u_noise_scale;
uniform float u_radius;
uniform float u_bias;
uniform float u_intensity;

varying vec2 v_uv;

float read_depth(vec2 local_uv) {
    return texture2D(t_depth, u_uv_offset + local_uv * u_uv_scale).x;
}

vec3 view_position_at(vec2 local_uv) {
    float depth = read_depth(local_uv);
    vec4 clip = vec4(vec3(local_uv, depth) * 2.0 - 1.0, 1.0);
    vec4 view = u_projection_inverse * clip;
    return view.xyz / view.w;
}

void main() {
    float depth = read_depth(v_uv);

    // sky / nothing rendered here
    if (depth >= 1.0) {
        gl_FragColor = vec4(1.0);
        return;
    }

    vec3 origin = view_position_at(v_uv);

    // geometric normal from depth derivatives (faceted, fine for AO)
    vec3 normal = normalize(cross(dFdx(origin), dFdy(origin)));
    normal *= -sign(dot(normal, origin)); // ensure it faces the camera

    vec3 random_vec = normalize(texture2D(t_noise, v_uv * u_noise_scale).xyz);
    vec3 tangent = normalize(random_vec - normal * dot(random_vec, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 tbn = mat3(tangent, bitangent, normal);

    float occlusion = 0.0;
    for (int i = 0; i < SAMPLE_COUNT; i++) {
        vec3 sample_pos = origin + (tbn * u_kernel[i]) * u_radius;

        vec4 offset = u_projection * vec4(sample_pos, 1.0);
        vec2 sample_uv = (offset.xy / offset.w) * 0.5 + 0.5;

        // stay inside this eye's viewport, never sample the other eye
        if (sample_uv.x < 0.0 || sample_uv.x > 1.0 ||
            sample_uv.y < 0.0 || sample_uv.y > 1.0) {
            continue;
        }

        float scene_z = view_position_at(sample_uv).z;

        float range_check = smoothstep(0.0, 1.0, u_radius / abs(origin.z - scene_z));
        occlusion += (scene_z >= sample_pos.z + u_bias ? 1.0 : 0.0) * range_check;
    }

    float ao = 1.0 - (occlusion / float(SAMPLE_COUNT)) * u_intensity;
    gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
}`;

// 4x4 box blur to hide the 4x4 noise pattern. Runs over the whole atlas at
// once; the seam between eyes is at most a couple of texels and never visible.
const blur_fragment = `
uniform sampler2D t_ao;
uniform vec2 u_texel;

varying vec2 v_uv;

void main() {
    float result = 0.0;
    for (int x = -2; x < 2; x++) {
        for (int y = -2; y < 2; y++) {
            result += texture2D(t_ao, v_uv + vec2(float(x), float(y)) * u_texel).r;
        }
    }
    gl_FragColor = vec4(vec3(result / 16.0), 1.0);
}`;

// Composite quad rendered inside the actual scene. gl_FragCoord is in
// framebuffer pixels, so dividing by the full framebuffer size lands each eye
// on its own half of the AO atlas with zero per-eye uniforms.
//
// t_mask is the transparency coverage buffer: wherever a see-through surface
// is visible in front of the opaque depth, AO fades to 1 so occlusion from
// geometry BEHIND the surface never gets multiplied on top of it.
const composite_fragment = `
uniform sampler2D t_ao;
uniform sampler2D t_mask;
uniform vec2 u_resolution;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float ao = texture2D(t_ao, uv).r;
    float mask = texture2D(t_mask, uv).r;
    gl_FragColor = vec4(vec3(mix(ao, 1.0, mask)), 1.0);
}`;

const build_kernel = (sample_count: number): Vector3[] => {
    const kernel: Vector3[] = [];
    for (let i = 0; i < sample_count; i++) {
        const sample = new Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() // hemisphere: z >= 0
        );
        sample.normalize();
        sample.multiplyScalar(Math.random());

        // pack samples towards the origin for tighter contact darkening
        let scale = i / sample_count;
        scale = 0.1 + scale * scale * 0.9;
        sample.multiplyScalar(scale);

        kernel.push(sample);
    }
    return kernel;
};

const build_noise_texture = (): DataTexture => {
    const size = 4;
    const data = new Float32Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        data[i * 4 + 0] = Math.random() * 2 - 1;
        data[i * 4 + 1] = Math.random() * 2 - 1;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 1;
    }
    const texture = new DataTexture(data, size, size, RGBAFormat, FloatType);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.needsUpdate = true;
    return texture;
};

interface AOTargets {
    width: number;
    height: number;
    depth_target: WebGLRenderTarget;
    ao_target: WebGLRenderTarget;
    blur_target: WebGLRenderTarget;
}

const dispose_targets = (targets: AOTargets) => {
    targets.depth_target.depthTexture?.dispose();
    targets.depth_target.dispose();
    targets.ao_target.dispose();
    targets.blur_target.dispose();
};

const create_targets = (width: number, height: number): AOTargets => {
    const depth_texture = new DepthTexture(width, height, UnsignedIntType);

    const depth_target = new WebGLRenderTarget(width, height, {
        depthTexture: depth_texture,
        depthBuffer: true
    });

    const ao_target = new WebGLRenderTarget(width, height, {
        depthBuffer: false,
        minFilter: LinearFilter,
        magFilter: LinearFilter
    });

    const blur_target = new WebGLRenderTarget(width, height, {
        depthBuffer: false,
        minFilter: LinearFilter,
        magFilter: LinearFilter
    });

    return { width, height, depth_target, ao_target, blur_target };
};

interface ViewInfo {
    camera: PerspectiveCamera;
    viewport: Vector4; // in framebuffer pixels
}

interface SSAOPropsSpecified {
    enabled: boolean;
    /** compiled into the shader; 8 for Quest, 16+ for PCVR */
    samples: number;
    /** world-space occlusion radius in metres */
    radius: number;
    intensity: number;
    /** depth bias to prevent self-occlusion acne */
    bias: number;
    /** AO buffer resolution relative to the eye buffer */
    resolution_scale: number;
}

type SSAOMode = "off" | "performance" | "balanced" | "quality";

interface SSAOPropsMode {
    mode: SSAOMode;
}

type SSAOProps = SSAOPropsSpecified | SSAOPropsMode;

const ssao_presets = {
    performance: {
        samples: 8,
        resolution_scale: 0.5,
        radius: 0.4,
        intensity: 1.15,
        bias: 0.025
    },
    balanced: {
        samples: 20,
        resolution_scale: 0.85,
        radius: 0.4,
        intensity: 1.0,
        bias: 0.02
    },
    quality: {
        samples: 32,
        resolution_scale: 1.0,
        radius: 0.4,
        intensity: 0.9,
        bias: 0.015
    }
} as Record<SSAOPropsMode["mode"], Omit<SSAOPropsSpecified, "enabled">>;

export const SSAO = (props: SSAOProps) => {
    if ("mode" in props) {
        if (props.mode === "off") {
            return null;
        }

        props = { enabled: true, ...ssao_presets[props.mode] };
    }

    return <SSAOImpl {...props} />;
}

const is_see_through = (material: Material): boolean => {
    if (material.transparent) {
        return true;
    }

    const physical = material as MeshPhysicalMaterial;
    return typeof physical.transmission === "number" && physical.transmission > 0;
};

const SSAOImpl = ({ enabled, samples, radius, intensity, bias, resolution_scale }: SSAOPropsSpecified) => {
    const noise_texture = useMemo(() => build_noise_texture(), []);

    // depth prepass: geometry only, no fragment colour output
    const depth_material = useMemo(
        () => new MeshBasicMaterial({ colorWrite: false, side: DoubleSide }),
        []
    );

    const ao_material = useMemo(
        () =>
            new ShaderMaterial({
                defines: { SAMPLE_COUNT: samples },
                uniforms: {
                    t_depth: { value: null },
                    t_noise: { value: noise_texture },
                    u_projection: { value: new Matrix4() },
                    u_projection_inverse: { value: new Matrix4() },
                    u_kernel: { value: build_kernel(samples) },
                    u_uv_offset: { value: new Vector2() },
                    u_uv_scale: { value: new Vector2(1, 1) },
                    u_noise_scale: { value: new Vector2(1, 1) },
                    u_radius: { value: radius },
                    u_bias: { value: bias },
                    u_intensity: { value: intensity }
                },
                vertexShader: fullscreen_vertex,
                fragmentShader: ao_fragment,
                depthTest: false,
                depthWrite: false
            }),
        [samples, noise_texture]
    );

    // keep tuning uniforms live without rebuilding the program
    useEffect(() => {
        ao_material.uniforms.u_radius!.value = radius;
        ao_material.uniforms.u_bias!.value = bias;
        ao_material.uniforms.u_intensity!.value = intensity;
    }, [ao_material, radius, bias, intensity]);

    const blur_material = useMemo(
        () =>
            new ShaderMaterial({
                uniforms: {
                    t_ao: { value: null },
                    u_texel: { value: new Vector2(1, 1) }
                },
                vertexShader: fullscreen_vertex,
                fragmentShader: blur_fragment,
                depthTest: false,
                depthWrite: false
            }),
        []
    );

    const mask_material = useMemo(
        () => new MeshBasicMaterial({ color: 0xffffff, depthWrite: false, side: DoubleSide }),
        []
    );

    // fullscreen quad scene used to run the AO and blur passes
    const pass_scene = useMemo(() => new Scene(), []);
    const pass_camera = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
    const pass_quad = useMemo(() => {
        const quad = new Mesh(new PlaneGeometry(2, 2));
        quad.frustumCulled = false;
        return quad;
    }, []);

    useEffect(() => {
        pass_scene.add(pass_quad);
        return () => {
            pass_scene.remove(pass_quad);
        };
    }, [pass_scene, pass_quad]);

    // the multiply quad that lives in the real scene
    const composite_material = useMemo(
        () =>
            new ShaderMaterial({
                uniforms: {
                    t_ao: { value: null },
                    u_resolution: { value: new Vector2(1, 1) },
                    t_mask: { value: null }
                },
                vertexShader: fullscreen_vertex,
                fragmentShader: composite_fragment,
                premultipliedAlpha: true,
                blending: MultiplyBlending,
                transparent: true,
                depthTest: false,
                depthWrite: false
            }),
        []
    );

    const composite_mesh = useMemo(() => {
        const mesh = new Mesh(new PlaneGeometry(2, 2), composite_material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 10_000; // after everything, including transparents
        mesh.raycast = () => {}; // it sits at the origin; never let raycasters hit it
        // vignette layer = head camera only, so spectator/MR cameras (whose
        // framebuffer layout doesn't match the AO atlas) never see the overlay
        mesh.layers.set(Layer.Vignette);
        mesh.userData._exclude_from_bounds = true;
        return mesh;
    }, [composite_material]);

    const targets_ref = useRef<AOTargets | null>(null);

    const scratch_views: ViewInfo[] = useMemo(() => [], []);
    const scratch_excluded: Object3D[] = useMemo(() => [], []);
    const scratch_see_through: Mesh[] = useMemo(() => [], []);
    const scratch_opaque: Mesh[] = useMemo(() => [], []);
    const scratch_clear_color = useMemo(() => new Color(), []);

    const flat_viewport = useMemo(() => new Vector4(), []);
    const drawing_buffer_size = useMemo(() => new Vector2(), []);
    const prepass_cameras = useMemo(() => [] as PerspectiveCamera[], []);
    const prepass_mask = useMemo(() => compute_layer_mask([
        Layer.Default,
        Layer.PlayerModel_TorsoAndHands
    ]), []);

    useEffect(() => {
        return () => {
            if (targets_ref.current) {
                dispose_targets(targets_ref.current);
                targets_ref.current = null;
            }
            noise_texture.dispose();
            depth_material.dispose();
            mask_material.dispose();
            ao_material.dispose();
            blur_material.dispose();
            composite_material.dispose();
            pass_quad.geometry.dispose();
            composite_mesh.geometry.dispose();
        };
    }, [
        noise_texture,
        depth_material,
        ao_material,
        blur_material,
        composite_material,
        pass_quad,
        composite_mesh
    ]);

    useFrame(({ gl, scene: frame_scene, camera }) => {
        if (!enabled) {
            composite_mesh.visible = false;
            return;
        }

        // ---- gather the views to render (one per eye in XR, one in flat) ----
        scratch_views.length = 0;
        let fb_width = 0;
        let fb_height = 0;

        if (gl.xr.isPresenting) {
            camera.updateWorldMatrix(true, false);
            gl.xr.updateCamera(camera as PerspectiveCamera);
            const xr_camera = gl.xr.getCamera();
            for (const sub_camera of xr_camera.cameras) {
                const eye_camera = sub_camera as PerspectiveCamera & { viewport: Vector4 };
                scratch_views.push({ camera: eye_camera, viewport: eye_camera.viewport });
                fb_width = Math.max(fb_width, eye_camera.viewport.x + eye_camera.viewport.z);
                fb_height = Math.max(fb_height, eye_camera.viewport.y + eye_camera.viewport.w);
            }
        } else {
            gl.getDrawingBufferSize(drawing_buffer_size);
            fb_width = drawing_buffer_size.x;
            fb_height = drawing_buffer_size.y;
            flat_viewport.set(0, 0, fb_width, fb_height);
            scratch_views.push({
                camera: camera as PerspectiveCamera,
                viewport: flat_viewport
            });
        }

        if (fb_width < 2 || fb_height < 2 || scratch_views.length === 0) {
            composite_mesh.visible = false;
            return;
        }

        // ---- (re)build render targets on size change ----
        const target_width = Math.max(1, Math.floor(fb_width * resolution_scale));
        const target_height = Math.max(1, Math.floor(fb_height * resolution_scale));

        let targets = targets_ref.current;
        if (!targets || targets.width !== target_width || targets.height !== target_height) {
            if (targets) {
                dispose_targets(targets);
            }
            // recreate rather than setSize: resizing a live target under XR
            // leaves the texture unsamplable (same issue the MR controller hit)
            targets = create_targets(target_width, target_height);
            targets_ref.current = targets;
        }

        // ---- save renderer state ----
        const prev_target = gl.getRenderTarget();
        const prev_xr_enabled = gl.xr.enabled;
        const prev_override = frame_scene.overrideMaterial;

        const prev_auto_clear = gl.autoClear;
        const prev_clear_alpha = gl.getClearAlpha();
        gl.getClearColor(scratch_clear_color);

        gl.xr.enabled = false;
        gl.setClearColor(0x000000, 0);

        // hide the composite quad and anything opted out of AO during the prepass
        composite_mesh.visible = false;
        scratch_excluded.length = 0;
        scratch_see_through.length = 0;
        scratch_opaque.length = 0;

        frame_scene.traverse((object) => {
            if (!object.visible) {
                return;
            }

            if (object.userData._exclude_from_ao) {
                object.visible = false;
                scratch_excluded.push(object);
                return;
            }

            const mesh = object as Mesh;
            if (!mesh.isMesh || !mesh.material) {
                return;
            }

            // opt-in for thick transmissives that should cast AO anyway
            if (mesh.userData._force_ao_opaque) {
                scratch_opaque.push(mesh);
                return;
            }

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            if (materials.every(is_see_through)) {
                // see-through surfaces never occlude; they go in the mask pass
                mesh.visible = false;
                scratch_see_through.push(mesh);
            } else {
                scratch_opaque.push(mesh);
            }
        });

        // ---- pass 1: opaque depth prepass, one render per eye viewport ----
        frame_scene.overrideMaterial = depth_material;

        for (let view_index = 0; view_index < scratch_views.length; view_index++) {
            const view = scratch_views[view_index]!;

            while (prepass_cameras.length <= view_index) {
                const scratch_camera = new PerspectiveCamera();
                scratch_camera.matrixAutoUpdate = false;
                scratch_camera.matrixWorldAutoUpdate = false;
                prepass_cameras.push(scratch_camera);
            }
            const prepass_camera = prepass_cameras[view_index]!;

            prepass_camera.projectionMatrix.copy(view.camera.projectionMatrix);
            prepass_camera.projectionMatrixInverse.copy(view.camera.projectionMatrixInverse);
            prepass_camera.matrixWorld.copy(view.camera.matrixWorld);
            prepass_camera.matrixWorldInverse.copy(view.camera.matrixWorld).invert();
            prepass_camera.layers.mask = prepass_mask;

            const vx = Math.floor(view.viewport.x * resolution_scale);
            const vy = Math.floor(view.viewport.y * resolution_scale);
            const vw = Math.floor(view.viewport.z * resolution_scale);
            const vh = Math.floor(view.viewport.w * resolution_scale);

            targets.depth_target.viewport.set(vx, vy, vw, vh);
            targets.depth_target.scissor.set(vx, vy, vw, vh);
            targets.depth_target.scissorTest = true;

            gl.setRenderTarget(targets.depth_target);
            gl.render(frame_scene, prepass_camera);
        }

        // ---- pass 1.5: see-through coverage mask ----
        // only see-through meshes visible; rendered depth-tested against the
        // opaque depth into the same target's colour buffer. autoClear off so
        // pass 1's depth (and black colour) survives.
        for (const mesh of scratch_see_through) {
            mesh.visible = true;
        }
        for (const mesh of scratch_opaque) {
            mesh.visible = false;
        }

        frame_scene.overrideMaterial = mask_material;
        gl.autoClear = false;

        for (let view_index = 0; view_index < scratch_views.length; view_index++) {
            const view = scratch_views[view_index]!;
            const vx = Math.floor(view.viewport.x * resolution_scale);
            const vy = Math.floor(view.viewport.y * resolution_scale);
            const vw = Math.floor(view.viewport.z * resolution_scale);
            const vh = Math.floor(view.viewport.w * resolution_scale);

            targets.depth_target.viewport.set(vx, vy, vw, vh);
            targets.depth_target.scissor.set(vx, vy, vw, vh);
            targets.depth_target.scissorTest = true;

            gl.setRenderTarget(targets.depth_target);
            gl.render(frame_scene, prepass_cameras[view_index]!);
        }

        gl.autoClear = prev_auto_clear;
        frame_scene.overrideMaterial = prev_override;

        for (const mesh of scratch_opaque) {
            mesh.visible = true;
        }
        for (const object of scratch_excluded) {
            object.visible = true;
        }

        // ---- pass 2: SSAO, one fullscreen draw per eye viewport ----
        pass_quad.material = ao_material;
        ao_material.uniforms.t_depth!.value = targets.depth_target.depthTexture;

        for (const view of scratch_views) {
            const vx = Math.floor(view.viewport.x * resolution_scale);
            const vy = Math.floor(view.viewport.y * resolution_scale);
            const vw = Math.floor(view.viewport.z * resolution_scale);
            const vh = Math.floor(view.viewport.w * resolution_scale);

            ao_material.uniforms.u_projection!.value.copy(view.camera.projectionMatrix);
            ao_material.uniforms.u_projection_inverse!.value
                .copy(view.camera.projectionMatrix)
                .invert();
            ao_material.uniforms.u_uv_offset!.value.set(
                vx / target_width,
                vy / target_height
            );
            ao_material.uniforms.u_uv_scale!.value.set(
                vw / target_width,
                vh / target_height
            );
            ao_material.uniforms.u_noise_scale!.value.set(vw / 4, vh / 4);

            targets.ao_target.viewport.set(vx, vy, vw, vh);
            targets.ao_target.scissor.set(vx, vy, vw, vh);
            targets.ao_target.scissorTest = true;

            gl.setRenderTarget(targets.ao_target);
            gl.render(pass_scene, pass_camera);
        }

        // ---- pass 3: blur, single fullscreen draw over the whole atlas ----
        pass_quad.material = blur_material;
        blur_material.uniforms.t_ao!.value = targets.ao_target.texture;
        blur_material.uniforms.u_texel!.value.set(1 / target_width, 1 / target_height);

        targets.blur_target.viewport.set(0, 0, target_width, target_height);
        targets.blur_target.scissorTest = false;

        gl.setRenderTarget(targets.blur_target);
        gl.render(pass_scene, pass_camera);

        // ---- restore state; main render happens after this callback ----
        gl.setRenderTarget(prev_target);
        gl.xr.enabled = prev_xr_enabled;
        gl.setClearColor(scratch_clear_color, prev_clear_alpha);

        composite_material.uniforms.t_ao!.value = targets.blur_target.texture;
        composite_material.uniforms.t_mask!.value = targets.depth_target.texture;
        composite_material.uniforms.u_resolution!.value.set(fb_width, fb_height);
        composite_mesh.visible = true;
    });

    return <primitive object={composite_mesh} />;
};
