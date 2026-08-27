import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CapsuleGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Plane, PlaneGeometry, Quaternion, Scene, ShaderChunk, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderTarget } from "three";



import { usePlayerOrigin } from "../contexts";
import { active_pipeline } from "./GraphicsPipeline";
import { Layer } from "./layers";
import type { CameraControllerTransform} from "./SpectatorCameraController";
import { frame_transforms } from "./SpectatorCameraController";


// three and uikit each inject a clipping block into the fragment shader, and
// both declare `vec4 plane;` (+ distanceToPlane/distanceGradient/clipOpacity)
// in main()'s scope. With renderer.clippingPlanes set, both land in the same
// uikit material -> GLSL 'plane': redefinition -> shader won't compile.
// Wrapping three's native clipping chunk in its own block scope isolates its
// locals so they no longer collide with uikit's.
if (!(ShaderChunk as any)._mr_clip_scoped) {
    ShaderChunk.clipping_planes_fragment = `{\n${ShaderChunk.clipping_planes_fragment}\n}`;
    (ShaderChunk as any)._mr_clip_scoped = true;
}

export interface MixedRealityCameraControllerProps {
    first_person_transform?: CameraControllerTransform;
    third_person_transform?: CameraControllerTransform;
    first_person_horizontal_fov?: number;
    third_person_horizontal_fov?: number;
}

// TL blit: show the foreground render's RGB (premultiplied colour on black).
// (a plain MeshBasicMaterial with map handles this; no custom shader needed.)

// TR mask: show the foreground render's ALPHA channel as greyscale.
// white = opaque foreground, grey = semi-transparent, black = nothing.
const fragment_alpha_to_grey = `
uniform sampler2D tForeground;
varying vec2 vUv;
void main() {
    float a = texture2D(tForeground, vUv).a;
    gl_FragColor = vec4(vec3(a), 1.0);
}`;

const vertex_passthrough = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const MixedRealityCameraController = ({
    first_person_transform = frame_transforms.first_person(),
    third_person_transform = frame_transforms.third_person({
        position_ref: { current: new Vector3(2, 0.75, 2) },
        quaternion_ref: { current: new Quaternion(0, 0, 0, 1) }
    }),
    first_person_horizontal_fov = 50,
    third_person_horizontal_fov = 50
}: MixedRealityCameraControllerProps) => {
    const { scene, size } = useThree();

    const first_person_camera = useMemo(() => {
        const cam = new PerspectiveCamera(50, 16 / 9, 0.1, 1000);
        cam.userData.is_spectator_camera = true;
        scene.add(cam);
        return cam;
    }, []);

    useEffect(() => {
        const vertical_fov =
            2 *
            Math.atan(
                Math.tan((first_person_horizontal_fov * Math.PI) / 180 / 2) *
                    (size.height / size.width)
            ) *
            (180 / Math.PI);
        first_person_camera.fov = vertical_fov;
        first_person_camera.updateProjectionMatrix();
    }, [first_person_horizontal_fov, first_person_camera]);

    const third_person_camera = useMemo(() => {
        const cam = new PerspectiveCamera(50, 16 / 9, 0.1, 1000);
        cam.userData.is_spectator_camera = true;
        scene.add(cam);
        return cam;
    }, []);

    useEffect(() => {
        const vertical_fov =
            2 *
            Math.atan(
                Math.tan((third_person_horizontal_fov * Math.PI) / 180 / 2) *
                    (size.height / size.width)
            ) *
            (180 / Math.PI);
        third_person_camera.fov = vertical_fov;
        third_person_camera.updateProjectionMatrix();
    }, [third_person_horizontal_fov, third_person_camera]);

    // update aspects when size changes (dont destroy cameras on resize!)
    useEffect(() => {
        first_person_camera.aspect = size.width / size.height;
        first_person_camera.updateProjectionMatrix();

        third_person_camera.aspect = size.width / size.height;
        third_person_camera.updateProjectionMatrix();
    }, [size.width, size.height, first_person_camera, third_person_camera]);

    // opt into player model hands on first person camera, but no player model on third person camera (as their real world camera feed will be used instead)
    useEffect(() => {
        first_person_camera.layers.enable(Layer.PlayerModel_TorsoAndHands);
        first_person_camera.layers.enable(Layer.ThirdPerson_ForceHide);
    }, [first_person_camera]);

    const compositor_camera = useMemo(() => {
        const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        cam.position.z = 1;
        return cam;
    }, []);

    // foreground clip: keeps the slab between the camera and the player plane.
    const clipping_plane = useMemo(() => {
        return new Plane(new Vector3(0, 0, -1), 0.1);
    }, []);
    // background clip: same plane flipped, keeps everything behind the player.
    const background_clip_plane = useMemo(() => {
        return new Plane(new Vector3(0, 0, 1), 0.1);
    }, []);

    const player_capsule_geometry = useMemo(() => {
        return new CapsuleGeometry(0.3, 1.7, 4, 8);
    }, []);

    const player_capsule_material = useMemo(() => {
        return new MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            depthTest: true
        });
    }, []);

    const player_capsule_mesh = useMemo(() => {
        return new Mesh(player_capsule_geometry, player_capsule_material);
    }, [player_capsule_geometry, player_capsule_material]);

    useEffect(() => {
        scene.add(player_capsule_mesh);
        player_capsule_mesh.layers.set(Layer.MR_PlayerCapsule);

        return () => {
            scene.remove(player_capsule_mesh);
        };
    }, [scene, player_capsule_mesh]);

    // The foreground is rendered ONCE into this RGBA target. TL reads its colour,
    // TR reads its alpha. Recreated (not setSize'd) on resolution change — the
    // setSize dispose/reuse path is what left the texture unsamplable under XR.
    const fg_rt_ref = useRef<WebGLRenderTarget | null>(null);

    const blit_material = useMemo(
        () => new MeshBasicMaterial({ map: null, depthTest: false }),
        []
    );

    const mask_material = useMemo(() => {
        return new ShaderMaterial({
            vertexShader: vertex_passthrough,
            fragmentShader: fragment_alpha_to_grey,
            uniforms: { tForeground: { value: null } },
            depthTest: false,
            depthWrite: false
        });
    }, []);

    const compositor_scene = useMemo(() => new Scene(), []);
    const compositor_quad = useMemo<Mesh>(
        () => new Mesh(new PlaneGeometry(2, 2), blit_material),
        [blit_material]
    );

    useEffect(() => {
        compositor_scene.add(compositor_quad);
        return () => {
            compositor_scene.remove(compositor_quad);
            compositor_quad.geometry.dispose();
        };
    }, []);

    useEffect(() => {
        return () => {
            fg_rt_ref.current?.dispose();
            player_capsule_geometry.dispose();
            player_capsule_material.dispose();
            blit_material.dispose();
            mask_material.dispose();
        };
    }, []);

    const render_size = useMemo(() => new Vector2(), []);

    const xr_origin_ref = usePlayerOrigin();

    useFrame(({ gl, scene, camera }) => {
        gl.render(scene, camera);

        if (!gl.xr.isPresenting) {
            return;
        }

        gl.getDrawingBufferSize(render_size);
        const draw_width = render_size.x / gl.getPixelRatio();
        const draw_height = render_size.y / gl.getPixelRatio();

        // (re)create the foreground RT when the resolution changes. Recreating a
        // fresh target — rather than setSize on a live one — keeps its colour
        // texture samplable as a map under the XR session.
        let fg_rt = fg_rt_ref.current;
        if (
            !fg_rt ||
            fg_rt.width !== render_size.x ||
            fg_rt.height !== render_size.y
        ) {
            fg_rt?.dispose();
            fg_rt = new WebGLRenderTarget(render_size.x, render_size.y, {
                samples: 0
            });
            fg_rt.texture.colorSpace = SRGBColorSpace;
            fg_rt_ref.current = fg_rt;
        }
        // keep the compositor materials pointed at the current RT texture
        if (blit_material.map !== fg_rt.texture) {
            blit_material.map = fg_rt.texture;
            blit_material.needsUpdate = true;
        }
        mask_material.uniforms.tForeground!.value = fg_rt.texture;

        const headset_camera = gl.xr.getCamera();
        first_person_transform({
            spec_camera: first_person_camera,
            headset_cameras: headset_camera,
            gl,
            xr_origin_ref
        });
        third_person_transform({
            spec_camera: third_person_camera,
            headset_cameras: headset_camera,
            gl,
            xr_origin_ref
        });

        const first_person_position = first_person_camera.position.clone();
        const first_person_quaternion = first_person_camera.quaternion.clone();
        const third_person_quaternion = third_person_camera.quaternion.clone();

        const xr_state = gl.xr.enabled;
        const render_target = gl.getRenderTarget();
        gl.xr.enabled = false;

        // plane through the player, perpendicular to the third-person view
        const camera_forward = new Vector3(0, 0, -1).applyQuaternion(
            third_person_quaternion
        );
        clipping_plane.normal.copy(camera_forward).negate();
        clipping_plane.constant = camera_forward.dot(first_person_position);
        background_clip_plane.normal.copy(camera_forward);
        background_clip_plane.constant = -camera_forward.dot(
            first_person_position
        );

        // capsule at headset, depth-only, to keep the real player from being drawn over
        player_capsule_mesh.position
            .copy(first_person_position)
            .addScaledVector(new Vector3(0, 1, 0), -0.7);
        player_capsule_mesh.quaternion.copy(first_person_quaternion);

        // ---- ONE foreground render into the RGBA target (colour + coverage) ----
        // clear to transparent black so opaque -> alpha 1, empty -> alpha 0, and
        // normal blending over transparent black yields premultiplied colour.
        const prev_background = scene.background;
        scene.background = null;

        gl.setRenderTarget(fg_rt);
        gl.setViewport(0, 0, fg_rt.width, fg_rt.height);
        gl.setScissorTest(false);
        gl.setClearColor(0x000000, 0);
        gl.clear();

        // get render pass so can later substitute our spectator cameras into the render pass to ensure it actually gets used for the render, not the headset arraycamera
        const render_pass = active_pipeline.passes.find((p: any) => p.isRenderPass);
        const prev_cam = (render_pass as any)?.camera;


        if (render_pass) (render_pass as any).camera = third_person_camera;

        // pass 1: foreground slab, clipped at the player plane (+ capsule depth)
        gl.clippingPlanes = [clipping_plane];
        third_person_camera.layers.set(Layer.Default);
        third_person_camera.layers.enable(Layer.MR_PlayerCapsule);
        gl.render(scene, third_person_camera);

        // pass 2: force-foreground objects on top (clear depth only)
        gl.clippingPlanes = [];
        third_person_camera.layers.set(Layer.MR_ForceForeground);
        const prev_autoclear = gl.autoClear;
        gl.autoClear = false;
        gl.clear(false, true, false);
        gl.render(scene, third_person_camera);
        gl.autoClear = prev_autoclear;

        third_person_camera.layers.set(Layer.Default);
        scene.background = prev_background;
        gl.clippingPlanes = [];
        gl.setRenderTarget(null);

        // ---- composite the 4-quadrant output to the framebuffer ----
        // TL: foreground colour      TR: foreground alpha mask
        // BL: background colour       BR: first person view
        gl.setScissorTest(false);
        gl.setViewport(0, 0, draw_width, draw_height);
        gl.setClearColor(0x000000, 1);
        gl.clear();

        const draw_compositor = (
            mat: typeof blit_material | typeof mask_material,
            x: number,
            y: number
        ) => {
            compositor_quad.material = mat as any;
            gl.setViewport(x, y, draw_width / 2, draw_height / 2);
            gl.setScissor(x, y, draw_width / 2, draw_height / 2);
            gl.setScissorTest(true);
            if (render_pass) (render_pass as any).camera = compositor_camera;
            // TODO: composited tiles dont render correctly as of new graphics pipeline
            gl.render(compositor_scene, compositor_camera);
        };

        const draw_scene = (
            cam: PerspectiveCamera,
            x: number,
            y: number,
            clip?: Plane
        ) => {
            gl.setViewport(x, y, draw_width / 2, draw_height / 2);
            gl.setScissor(x, y, draw_width / 2, draw_height / 2);
            gl.setScissorTest(true);
            gl.clippingPlanes = clip ? [clip] : [];
            if (render_pass) (render_pass as any).camera = cam;
            gl.render(scene, cam);
            gl.clippingPlanes = [];
        };

        // TL: foreground colour (RGB of the RT)
        draw_compositor(blit_material, 0, draw_height / 2);
        // TR: foreground alpha mask (A of the RT, shown greyscale)
        draw_compositor(mask_material, draw_width / 2, draw_height / 2);
        // BL: background colour (behind the player plane)
        third_person_camera.layers.set(Layer.Default);
        draw_scene(third_person_camera, 0, 0, background_clip_plane);
        // BR: first person view
        draw_scene(first_person_camera, draw_width / 2, 0);

        // restore xr rendering state
        if (render_pass) (render_pass as any).camera = prev_cam;
        gl.setScissorTest(false);
        gl.setViewport(0, 0, draw_width, draw_height);
        gl.setRenderTarget(render_target);
        gl.xr.enabled = xr_state;
    }, 1);

    return null;
};
