import {useCallback, useLayoutEffect, useMemo, useRef} from "react"
import {useFrame, useThree} from "@react-three/fiber"

import {useSetting} from "@hyperlinkvr/react";
import {usePlayerOrigin} from "../contexts";
import type { Mesh, ShaderMaterial} from "three";
import {Color, MathUtils, Quaternion, Vector3} from "three";
import {Layer} from "../render";
import type {RapierCollider} from "@react-three/rapier";
import { useRapier} from "@react-three/rapier";
import {get_united_head_camera} from "../util/get_head_cameras";
import {CAPSULE_RADIUS, get_capsule_world_position} from "./motion";

const COLOR = 0x111111;

const OPEN_RADIUS = 1.3;
const MIN_RADIUS = 0.2;

// detection of snap turns
const TURN_PULSE_INTENSITY = 0.8; // change in quaternion above this in one frame will trigger a pulse
const TURN_PULSE_THRESHOLD = 0.05;
const TURN_PULSE_DECAY = 0.6;

// detection of teleports
const TELEPORT_PULSE_INTENSITY = 1.0; // change in distance above this in one frame will trigger a pulse
const TELEPORT_PULSE_THRESHOLD = 0.5;
const TELEPORT_PULSE_DECAY = 0.6;

// blackout when head intersects solid walls/ceilings
const BLACKOUT_FADE_START_DISTANCE = 0.18; // fade only once your face is nearly touching
const BLACKOUT_FADE_FULL_DISTANCE = 0.05;  // fully black essentially at contact
const BLACKOUT_PROBE_COUNT = 8;

// fast to black, slow to clear
const BLACKOUT_DARKEN_SMOOTHING = 12;
const BLACKOUT_CLEAR_SMOOTHING = 4;

const VERTEX_SHADER = `
varying vec2 view_tan;
void main() {
  vec2 ndc = position.xy * 2.0;
 
  view_tan = vec2(
    (ndc.x + projectionMatrix[2][0]) / projectionMatrix[0][0],
    (ndc.y + projectionMatrix[2][1]) / projectionMatrix[1][1]
  );
 
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
uniform float intensity;
uniform float clear_radius;
uniform vec3 vignette_color;
uniform float blackout;
varying vec2 view_tan;
void main() {
  float dist = length(view_tan);
  float alpha = smoothstep(clear_radius, clear_radius + 0.2, dist);
 
  // blackout covers the whole view, so it wins over the vignette's ring
  gl_FragColor = vec4(vignette_color, max(alpha * intensity, blackout));
}
`

// vignette is now for both locomotion comfort and blacking out when player head intersects walls
export const Vignette = ({
    max_linear_speed = 3.0,
    max_angular_speed = 1.5,
}) => {
    const origin_ref = usePlayerOrigin();

    const [vignette_intensity] = useSetting("vignette_intensity");
    const vignette_enabled = vignette_intensity > 0;

    const material_ref = useRef<ShaderMaterial | null>(null);

    const current_position = useRef(new Vector3());
    const current_quat = useRef(new Quaternion());

    const last_position = useRef(new Vector3());
    const last_quat = useRef(new Quaternion());
    const teleport_pulse = useRef(0);
    const turn_pulse = useRef(0);

    const initialised = useRef(false);

    const last_intensity = useRef(vignette_intensity);
    const preview_timer = useRef(0);
    const intensity_settled = useRef(false);

    const {gl, camera} = useThree();
    const {world, rapier, rigidBodyStates} = useRapier();

    const head_world = useRef(new Vector3());
    const capsule_world = useRef(new Vector3());
    const blackout_amount = useRef(0);

    // fixed horizontal directions, reused every frame
    const probe_directions = useMemo(() => {
        const directions: Vector3[] = [];

        for (let index = 0; index < BLACKOUT_PROBE_COUNT; index++) {
            const angle = (index / BLACKOUT_PROBE_COUNT) * Math.PI * 2;
            directions.push(new Vector3(Math.cos(angle), 0, Math.sin(angle)));
        }

        return directions;
    }, []);

    // only static environment should blind the player
    // a grabbed object held up to the face, or the player's own avatar parts, obviously shouldn't
    const is_environment = useCallback(
        (collider: RapierCollider): boolean => {
            const body = collider.parent();
            if (!body) return false;

            if (!body.isFixed()) return false;

            const name = rigidBodyStates.get(body.handle)?.object.name ?? "";

            const is_player_part =
                name.startsWith("avatar_head_rb") ||
                name.startsWith("avatar_torso_rb") ||
                name.startsWith("avatar_hand_rb");

            return !is_player_part;
        },
        [rigidBodyStates]
    );

    useFrame((_, delta) => {
        const material = material_ref.current;
        const origin = origin_ref.current;

        if (!material || !origin) return;

        const current_pos = current_position.current;
        const current_qua = current_quat.current;

        origin.getWorldPosition(current_pos);
        origin.getWorldQuaternion(current_qua);

        if (!initialised.current) {
            last_position.current.copy(current_pos);
            last_quat.current.copy(current_qua);
            initialised.current = true;
            return;
        }

        const dt = Math.max(delta, 1e-4);

        const distance_moved = current_pos.distanceTo(last_position.current);
        const linear_speed = distance_moved / dt;
        const normalised_linear = MathUtils.clamp(linear_speed / max_linear_speed, 0.0, 1.0);

        if (distance_moved > TELEPORT_PULSE_THRESHOLD) {
            teleport_pulse.current = TELEPORT_PULSE_INTENSITY;
        } else {
            teleport_pulse.current = Math.max(0, teleport_pulse.current - delta / TELEPORT_PULSE_DECAY);
        }

        const angle_rotated = current_qua.angleTo(last_quat.current);
        const angular_speed = angle_rotated / dt;
        const normalised_angular = MathUtils.clamp(angular_speed / max_angular_speed, 0.0, 1.0);

        if (angle_rotated > TURN_PULSE_THRESHOLD) {
            turn_pulse.current = TURN_PULSE_INTENSITY;
        } else {
            turn_pulse.current = Math.max(0, turn_pulse.current - delta / TURN_PULSE_DECAY);
        }

        last_position.current.copy(current_pos);
        last_quat.current.copy(current_qua);

        // blackout handling
        const head_camera = get_united_head_camera(gl, camera);
        head_camera.getWorldPosition(head_world.current);

        let nearest_surface = Infinity;

        for (const direction of probe_directions) {
            const ray = new rapier.Ray(head_world.current, direction);

            const hit = world.castRay(
                ray,
                BLACKOUT_FADE_START_DISTANCE,
                true,
                undefined, // filterFlags
                undefined, // filterGroups
                undefined, // filterExcludeCollider
                undefined, // filterExcludeRigidBody
                is_environment
            );

            if (hit && hit.timeOfImpact < nearest_surface) {
                nearest_surface = hit.timeOfImpact;
            }
        }

        // the capsule already stops locomotion at walls so the only way the head ends up in geometry is the player physically walking their real body through it,
        // which shows up as the head being somewhere the resolved capsule isn't
        get_capsule_world_position(capsule_world.current);
        const head_escaped = head_world.current.distanceTo(capsule_world.current) > CAPSULE_RADIUS;

        const target_blackout = (!head_escaped || nearest_surface >= BLACKOUT_FADE_START_DISTANCE)
            ? 0
            : Math.min(
                1,
                (BLACKOUT_FADE_START_DISTANCE - nearest_surface) /
                (BLACKOUT_FADE_START_DISTANCE - BLACKOUT_FADE_FULL_DISTANCE)
            );

        const blackout_smoothing = target_blackout > blackout_amount.current
            ? BLACKOUT_DARKEN_SMOOTHING
            : BLACKOUT_CLEAR_SMOOTHING;

        blackout_amount.current = MathUtils.lerp(
            blackout_amount.current,
            target_blackout,
            1 - Math.exp(-blackout_smoothing * delta)
        );

        material.uniforms.blackout!.value = blackout_amount.current;

        // show comfort vignette briefly when its setting changes
        const intensity_changed = Math.abs(last_intensity.current - vignette_intensity) > 0.5;
        if (intensity_changed) {
            last_intensity.current = vignette_intensity;

            if (intensity_settled.current) {
                preview_timer.current = 0.5;
            } else {
                intensity_settled.current = true;
            }
        } else {
            preview_timer.current = Math.max(0, preview_timer.current - delta);
        }

        const preview_active = preview_timer.current > 0;

        const max_closed = MathUtils.lerp(1.1, MIN_RADIUS, vignette_intensity / 100);

        // force radius and opacity until preview timer nearly over
        if (preview_timer.current > 0.1) {
            const target_radius = vignette_enabled
                ? MathUtils.lerp(OPEN_RADIUS, max_closed, 1.0)
                : OPEN_RADIUS;
            material.uniforms.clear_radius!.value = target_radius;

            const target_opacity = (vignette_enabled && 1.0 > 0.05) ? 1.0 : 0.0;
            material.uniforms.intensity!.value = target_opacity;
            return;
        }

        const movement_factor = Math.max(normalised_linear, normalised_angular, teleport_pulse.current, turn_pulse.current);
        const effective_movement_factor = preview_active ? 1.0 : movement_factor;

        const target_radius = vignette_enabled
            ? MathUtils.lerp(OPEN_RADIUS, max_closed, effective_movement_factor)
            : OPEN_RADIUS;

        // smoothly animate the radius
        material.uniforms.clear_radius!.value = MathUtils.lerp(
            material.uniforms.clear_radius!.value,
            target_radius,
            1 - Math.exp(-12 * delta),
        );

        // fade opacity out if not moving or if completely disabled in settings
        const opacity_smoothing = preview_active ? 8 : 15;
        const target_opacity = (vignette_enabled && effective_movement_factor > 0.05) ? 1.0 : 0.0;
        material.uniforms.intensity!.value = MathUtils.lerp(
            material.uniforms.intensity!.value,
            target_opacity,
            1 - Math.exp(-opacity_smoothing * delta),
        );
    });

    const mesh_ref = useRef<Mesh | null>(null);

    useLayoutEffect(() => {
        if (mesh_ref.current) {
            mesh_ref.current.layers.set(Layer.Vignette);
        }
    }, []);

    return (
        <mesh frustumCulled={false} renderOrder={999} ref={mesh_ref}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
                ref={material_ref}
                transparent
                depthTest={false}
                depthWrite={false}
                uniforms={{
                    intensity: { value: 0 },
                    clear_radius: { value: OPEN_RADIUS },
                    vignette_color: { value: new Color(COLOR) },
                    blackout: { value: 0 },
                }}
                vertexShader={VERTEX_SHADER}
                fragmentShader={FRAGMENT_SHADER}
            />
        </mesh>
    );
}
