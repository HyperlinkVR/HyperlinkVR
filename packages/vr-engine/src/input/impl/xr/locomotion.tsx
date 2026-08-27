import type { XRControllerState} from "@react-three/xr";
import {useXRControllerLocomotion, useXRInputSourceState, XRSpace} from "@react-three/xr";
import type {RefObject} from "react";
import { useCallback, useMemo, useRef, useState} from "react";
import type {Group} from "three";
import { Quaternion, Vector3} from "three";
import {useSetting} from "@hyperlinkvr/react";
import {usePlayerOrigin} from "../../../contexts";
import {useRapier} from "@react-three/rapier";
import {createPortal, useFrame, useThree} from "@react-three/fiber";
import {SPRINT_SPEED, WALK_SPEED} from "../../values";
import {request_player_movement} from "../../../player/motion";

const TELEPORT_STICK_FORWARD_THRESHOLD = 0.7;
const TELEPORT_STICK_RELEASE_THRESHOLD = 0.3;

// walk speed m/s is enforced for teleporting by keeping a sliding window of accumulated distance,
// and only allowing teleport if the new accumulated distance is less than the max distance for the window (by calculating from m/s)
// larger windows allow a larger distance to be teleported in one go, but takes longer to recover
const TELEPORT_LIMIT_WINDOW_S = 2;

const TELEPORT_RAY_START_OFFSET = 0.2;

// how flat a surface must be to count as teleportable (1 = perfectly horizontal)
const TELEPORT_MIN_NORMAL_Y = 0.7;

export const XRLocomotion = ({ origin }: { origin: RefObject<Group | null> }) => {
    const [locomotion] = useSetting("vr_locomotion");
    const [locomotion_hand] = useSetting("vr_locomotion_hand");
    const rotation_hand = useMemo(() => (locomotion_hand === "left" ? "right" : "left"), [locomotion_hand]);

    const locomotion_controller = useXRInputSourceState("controller", locomotion_hand);
    const rotation_controller = useXRInputSourceState("controller", rotation_hand);

    const [rotation] = useSetting("vr_rotation");
    const [snap_angle] = useSetting("vr_snap_rotation_angle");
    const [smooth_speed] = useSetting("vr_smooth_rotation_speed");
    const smooth_speed_rad = useMemo(() => smooth_speed * (Math.PI / 180), [smooth_speed]);

    // TODO: context for this so sdk can set
    const can_sprint = true;

    const sprint_enabled = useRef(false);
    const sprint_just_pressed = useRef(false);
    const thumbstick_just_reset = useRef(false);
    const [speed, setSpeed] = useState(WALK_SPEED);

    useFrame(() => {
        if (!locomotion_controller || !can_sprint) {
            sprint_enabled.current = false;
            setSpeed(WALK_SPEED);
            return;
        }

        const thumbstick = locomotion_controller.gamepad["xr-standard-thumbstick"];
        if (!thumbstick) {
            sprint_enabled.current = false;
            setSpeed(WALK_SPEED);
            return;
        }

        if (!thumbstick_just_reset.current && Math.abs(thumbstick.xAxis!) < 0.05 && Math.abs(thumbstick.yAxis!) < 0.05) {
            thumbstick_just_reset.current = true;

            // end a sprint if the thumbstick is released
            // TODO: allow this behaviour to be disabled for pure toggle sprint
            if (sprint_enabled.current) {
                sprint_enabled.current = false;
                setSpeed(WALK_SPEED);
                return;
            }
        } else {
            thumbstick_just_reset.current = false;
        }

        const sprint_pressed = thumbstick.state === "pressed";
        const sprint_rising_edge = sprint_pressed && !sprint_just_pressed.current;

        // toggle sprint
        if (sprint_rising_edge) {
            sprint_enabled.current = !sprint_enabled.current;
            sprint_just_pressed.current = true;

            setSpeed(sprint_enabled.current ? SPRINT_SPEED : WALK_SPEED);
        }

        // reset rising edge if the button is released
        if (!sprint_pressed) {
            sprint_just_pressed.current = false;
        }
    });


    const {camera} = useThree();

    const cam_local_pos = useMemo(() => new Vector3(), []);
    const rotated_cam_pos = useMemo(() => new Vector3(), []);
    const y_axis = useMemo(() => new Vector3(0, 1, 0), []);

    const rotate_around_head = useCallback((angle: number) => {
        if (!origin.current) return;

        cam_local_pos.copy(camera.position);
        cam_local_pos.y = 0;

        rotated_cam_pos.copy(cam_local_pos).applyAxisAngle(y_axis, angle);
        origin.current.position.add(cam_local_pos).sub(rotated_cam_pos);
        origin.current.rotation.y += angle;
    }, [origin, camera, cam_local_pos, rotated_cam_pos, y_axis]);

    const on_locomotion = useCallback((velocity: Vector3, rot_velocity_y: number, delta: number) => {
        if (!origin.current) return;

        const delta_x = velocity.x * delta;
        const delta_z = velocity.z * delta;
        request_player_movement(delta_x, delta_z);

        // apply snap rotation to the origin group directly
        // TODO: unite with smooth turn effect below
        if (rot_velocity_y !== 0) {
            //rotate_around_head(rot_velocity_y);
            origin.current.rotation.y += rot_velocity_y;
        }
    }, []);

    // TODO: option for hand steered locomotion, rather than head steered like now
    useXRControllerLocomotion(on_locomotion,
        {
            // in teleport mode, explictly disable the translation, but keep rotation
            // teleportation is handled by TeleportSurface, not this component
            // @ts-ignore not sure why typescript believes this cant take boolean, the docs state it can
            speed: locomotion === "walk" ? speed : false
        },
        {
            // built in smooth rotation doesn't offset properly, so just disable snap angle when on smooth mode and implement our own
            type: "snap",
            degrees: rotation === "smooth" ? 0 : snap_angle,
        },
        locomotion_hand
    );

    // manual implementation of smooth turn
    useFrame((_, delta) => {
        if (rotation !== "smooth" || !origin.current || !rotation_controller) return;

        const thumbstick = rotation_controller.gamepad["xr-standard-thumbstick"];
        if (!thumbstick) return;

        const turn_axis = thumbstick.xAxis ?? 0;

        // deadzone
        if (Math.abs(turn_axis) < 0.05) return;

        // clamp delta to prevent massive rotational jumps if a frame drops
        const safe_delta = Math.min(delta, 0.05);
        const angle = turn_axis * smooth_speed_rad * safe_delta * -1;

        rotate_around_head(angle);
    });

    return null;
};

// TODO: click stick to cancel teleport
// TODO: fix vignette for teleport with pulse

export const XRTeleportControl = ({
    input_source_state,
    enabled
}: {
    input_source_state: XRControllerState;
    enabled: boolean;
}) => {
    const origin = usePlayerOrigin();
    const { world, rapier } = useRapier();

    const ray_space_ref = useRef<Group>(null);
    const marker_ref = useRef<Group>(null);

    const was_aiming = useRef(false);
    const has_valid_target = useRef(false);

    const scratch = useMemo(
        () => ({
            ray_position: new Vector3(),
            ray_quaternion: new Quaternion(),
            ray_direction: new Vector3(),
            landing_point: new Vector3()
        }),
        []
    );

    const {scene} = useThree();

    // TODO: context for this so sdk can set
    const can_sprint = true;

    const speed = can_sprint ? SPRINT_SPEED : WALK_SPEED;

    const available_distance_m = useRef(speed * TELEPORT_LIMIT_WINDOW_S);

    useFrame((_, delta) => {
        const max_burst_distance = speed * TELEPORT_LIMIT_WINDOW_S;

        available_distance_m.current = Math.min(
            max_burst_distance,
            available_distance_m.current + (speed * delta)
        );

        const max_distance = available_distance_m.current;

        const marker = marker_ref.current;
        const ray_space = ray_space_ref.current;

        if (!enabled || !ray_space) {
            if (marker) marker.visible = false;
            was_aiming.current = false;
            has_valid_target.current = false;
            return;
        }

        const thumbstick = input_source_state.gamepad?.["xr-standard-thumbstick"];
        const stick_y = thumbstick?.yAxis ?? 0;
        const aiming = was_aiming.current
            ? stick_y <= -TELEPORT_STICK_RELEASE_THRESHOLD
            : stick_y < -TELEPORT_STICK_FORWARD_THRESHOLD;
        const released = was_aiming.current && !aiming;

        if (aiming) {
            // ray from the controller's target-ray space, offset forward
            ray_space.updateWorldMatrix(true, false);
            ray_space.getWorldPosition(scratch.ray_position);
            ray_space.getWorldQuaternion(scratch.ray_quaternion);
            scratch.ray_direction
                .set(0, 0, -1)
                .applyQuaternion(scratch.ray_quaternion)
                .normalize();

            scratch.ray_position.addScaledVector(
                scratch.ray_direction,
                TELEPORT_RAY_START_OFFSET
            );

            const ray = new rapier.Ray(scratch.ray_position, scratch.ray_direction);
            const hit = world.castRayAndGetNormal(ray, max_distance, true);

            const distance = hit?.timeOfImpact;

            if (hit && distance !== undefined && hit.normal.y >= TELEPORT_MIN_NORMAL_Y) {
                const point = ray.pointAt(distance);
                scratch.landing_point.set(point.x, point.y, point.z);
                has_valid_target.current = true;
                if (marker) {
                    marker.position.copy(scratch.landing_point);
                    marker.visible = true;
                }
            } else {
                has_valid_target.current = false;
                if (marker) marker.visible = false;
            }
        } else if (marker) {
            marker.visible = false;
        }

        if (released && has_valid_target.current) {
            const origin_group = origin.current;
            if (origin_group) {
                available_distance_m.current -= origin_group.position.distanceTo(scratch.landing_point);
                origin_group.position.copy(scratch.landing_point);
            }
            has_valid_target.current = false;
        }

        was_aiming.current = aiming;
    });

    return (
        <>
            <XRSpace
                ref={ray_space_ref}
                space={input_source_state.inputSource.targetRaySpace}
            />

            {createPortal(
                <group ref={marker_ref} visible={false} position={[0, 0.01, 0]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[0.2, 0.3, 32]} />
                        <meshBasicMaterial color={0x44ccff} transparent opacity={0.8} />
                    </mesh>
                </group>,
                scene
            )}
        </>
    );
};

// TODO: you can teleport onto yourself :sob:
