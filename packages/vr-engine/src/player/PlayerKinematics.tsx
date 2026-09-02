import {useFrame, useThree} from "@react-three/fiber";
import type {RapierCollider} from "@react-three/rapier";
import { useRapier} from "@react-three/rapier";
import type {RefObject} from "react";
import { useCallback, useEffect, useMemo, useRef} from "react";
import {Euler, Quaternion, Vector3} from "three";
import {usePlayerOrigin} from "../contexts";
import {useSetting} from "@hyperlinkvr/react";
import {useXRInputSourceState} from "@react-three/xr";
import {useFlatFrameInput} from "../input/impl/flat/bindings";
import {useSessionMode} from "../../../react/src/contexts/SessionMode";
import {JUMP_SPEED} from "../input/values";
import {useWorldEnvironment} from "../world/WorldEnvironmentContext";
import {CAPSULE_RADIUS, consume_player_movement, set_capsule_world_position} from "./motion";
import {PLAYER_COLLISION_GROUPS, EXCLUDE_SENSORS} from "../physics/collision_groups";
import {get_active_seat} from "./seating";

const WORLD_UP = new Vector3(0, 1, 0);

const VRJumpButton = ({jump_pressed_ref}: {jump_pressed_ref: RefObject<boolean>}) => {
    const [locomotion_hand] = useSetting("vr_locomotion_hand");
    const jump_hand = useMemo(() => locomotion_hand === "left" ? "right" : "left", [locomotion_hand]);

    const state = useXRInputSourceState("controller", jump_hand);

    useFrame(() => {
        if (!state) {
            jump_pressed_ref.current = false;
            return;
        }

        const jump_pressed = state.gamepad["a-button"]?.state === "pressed";
        jump_pressed_ref.current = jump_pressed;
    });

    return null;
}

const FlatJumpButton = ({jump_pressed_ref}: {jump_pressed_ref: RefObject<boolean>}) => {
    const input = useFlatFrameInput();

    useFrame(() => {
        jump_pressed_ref.current = input.jump;
    });

    return null;
}

// TODO: is it worth having a binding thingy for XR then reading in an abstract way? then again this seems to be the only place its needed for now


const MIN_PLAYER_HEIGHT = 0.6;   // crouched / seated floor
const MAX_PLAYER_HEIGHT = 2.2;   // sanity ceiling (bad tracking, standing on a chair)
const HEAD_CLEARANCE = 0.1;      // eyes aren't at the crown of your head

const MAX_STEP_HEIGHT = 0.3;
const MIN_STEP_WIDTH = 0.2;
const SNAP_TO_GROUND_DISTANCE = 0.3;
const MAX_SLOPE_CLIMB_ANGLE = (50 * Math.PI) / 180;
const MIN_SLOPE_SLIDE_ANGLE = (35 * Math.PI) / 180;

const TERMINAL_VELOCITY = -25;
const KILL_LEVEL_Y = -50;

export const PlayerKinematics = () => {
    const origin_ref = usePlayerOrigin();
    const { world, rapier, rigidBodyStates } = useRapier();
    const { camera } = useThree();

    const velocity_y = useRef(0);
    const jump_pressed_ref = useRef(false);

    const head_world = useRef(new Vector3());
    const desired = useRef(new Vector3());
    const requested = useRef(new Vector3());

    const last_grounded_pos = useRef(new Vector3(0, 0, 0));

    const seat_captured = useRef(false);
    const seat_yaw_offset = useRef(0);
    const seat_local_pos = useRef(new Vector3());
    const ride_pos = useRef(new Vector3());
    const anchor_world_pos = useRef(new Vector3());
    const anchor_quat = useRef(new Quaternion());
    const seat_euler = useRef(new Euler());
    const head_local = useRef(new Vector3());

    const { world_env } = useWorldEnvironment();

    const should_hit_environment = useCallback(
        (collider: RapierCollider): boolean => {
            const body = collider.parent();
            if (!body) return true;

            const name = rigidBodyStates.get(body.handle)?.object.name ?? "";

            const is_player_part =
                name.startsWith("avatar_head_rb") ||
                name.startsWith("avatar_torso_rb") ||
                name.startsWith("avatar_hand_rb");

            return !is_player_part;
        },
        [rigidBodyStates]
    );

    // kinematic capsule teleported to the player each frame and ask rapier where it's allowed to end up
    const { controller, capsule_body, capsule_collider } = useMemo(() => {
        const character_controller = world.createCharacterController(0.01);

        character_controller.enableAutostep(MAX_STEP_HEIGHT, MIN_STEP_WIDTH, true);
        character_controller.enableSnapToGround(SNAP_TO_GROUND_DISTANCE);
        character_controller.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB_ANGLE);
        character_controller.setMinSlopeSlideAngle(MIN_SLOPE_SLIDE_ANGLE);
        character_controller.setApplyImpulsesToDynamicBodies(true);

        const body = world.createRigidBody(
            rapier.RigidBodyDesc.kinematicPositionBased()
        );

        const collider = world.createCollider(
            rapier.ColliderDesc.capsule(1, CAPSULE_RADIUS).setCollisionGroups(PLAYER_COLLISION_GROUPS),
            body
        );

        return {
            controller: character_controller,
            capsule_body: body,
            capsule_collider: collider
        };
    }, [world, rapier]);

    useEffect(() => {
        return () => {
            world.removeCollider(capsule_collider, false);
            world.removeRigidBody(capsule_body);
            world.removeCharacterController(controller);
        };
    }, [world, controller, capsule_body, capsule_collider]);

    useFrame((_, raw_delta) => {
        // clamp delta so lag spikes dont explode gravity
        const delta = Math.min(raw_delta, 1 / 30);

        const origin = origin_ref.current;
        if (!origin) return;

        const seat = get_active_seat();
        if (seat) {
            seat.anchor.updateWorldMatrix(true, false);

            if (!seat_captured.current) {
                // capture frame: face the seat, drop the head over the anchor, floor at anchor height
                anchor_world_pos.current.setFromMatrixPosition(seat.anchor.matrixWorld);
                anchor_quat.current.setFromRotationMatrix(seat.anchor.matrixWorld);
                seat_euler.current.setFromQuaternion(anchor_quat.current, "YXZ");
                const anchor_yaw = seat_euler.current.y;

                // where the head currently sits within the origin frame (xz only)
                camera.getWorldPosition(head_world.current);
                head_local.current.copy(head_world.current);
                origin.worldToLocal(head_local.current);
                head_local.current.y = 0;

                // point the origin the seat's way, then place it so the head lands on the anchor
                origin.rotation.y = anchor_yaw;
                head_local.current.applyAxisAngle(WORLD_UP, anchor_yaw);
                origin.position.set(
                    anchor_world_pos.current.x - head_local.current.x,
                    anchor_world_pos.current.y,
                    anchor_world_pos.current.z - head_local.current.z
                );
                origin.updateMatrixWorld(true);

                // store the ride pose in the anchor's local frame so we track moving/rotating seats
                seat_local_pos.current.copy(origin.position);
                seat.anchor.worldToLocal(seat_local_pos.current);
                seat_yaw_offset.current = origin.rotation.y - anchor_yaw;
                seat_captured.current = true;
            } else {
                // ride: re-expand the stored local pose under the anchor's current transform
                anchor_quat.current.setFromRotationMatrix(seat.anchor.matrixWorld);
                seat_euler.current.setFromQuaternion(anchor_quat.current, "YXZ");

                ride_pos.current.copy(seat_local_pos.current);
                seat.anchor.localToWorld(ride_pos.current);
                origin.position.copy(ride_pos.current);
                origin.rotation.y = seat_euler.current.y + seat_yaw_offset.current;
            }

            // keep the capsule under the head so the environment blackout still fires
            camera.getWorldPosition(head_world.current);
            set_capsule_world_position(head_world.current.x, head_world.current.y, head_world.current.z);
            return;
        }
        seat_captured.current = false;

        camera.getWorldPosition(head_world.current);

        // scale the capsule to the player's current head height (so they can crouch under stuff)
        const head_height = head_world.current.y - origin.position.y + HEAD_CLEARANCE;
        const player_height = Math.min(
            MAX_PLAYER_HEIGHT,
            Math.max(MIN_PLAYER_HEIGHT, head_height)
        );

        const capsule_half_height = Math.max(
            0.05,
            player_height / 2 - CAPSULE_RADIUS
        );
        capsule_collider.setHalfHeight(capsule_half_height);

        // the capsule stands under the head, not under the origin
        // in roomscale vr the player can physically walk away from the origin point
        const capsule_centre_y = origin.position.y + capsule_half_height + CAPSULE_RADIUS;

        capsule_body.setNextKinematicTranslation({
            x: head_world.current.x,
            y: capsule_centre_y,
            z: head_world.current.z
        });
        capsule_body.setTranslation(
            { x: head_world.current.x, y: capsule_centre_y, z: head_world.current.z },
            true
        );

        velocity_y.current += world_env.physics.gravity * delta;
        velocity_y.current = Math.max(velocity_y.current, TERMINAL_VELOCITY);

        if (jump_pressed_ref.current && controller.computedGrounded()) {
            velocity_y.current = JUMP_SPEED;
        }

        consume_player_movement(requested.current);

        desired.current.set(
            requested.current.x,
            velocity_y.current * delta,
            requested.current.z
        );

        controller.computeColliderMovement(
            capsule_collider,
            desired.current,
            EXCLUDE_SENSORS,
            PLAYER_COLLISION_GROUPS,
            should_hit_environment
        );

        const resolved = controller.computedMovement();

        if (controller.computedGrounded()) {
            velocity_y.current = 0;
            last_grounded_pos.current.copy(origin.position);
        }

        origin.position.x += resolved.x;
        origin.position.y += resolved.y;
        origin.position.z += resolved.z;

        if (origin.position.y < KILL_LEVEL_Y) {
            velocity_y.current = 0;

            // add a small y offset to last grounded pos
            const last_grounded_pos_with_offset = last_grounded_pos.current.clone();
            last_grounded_pos_with_offset.y += 0.5;

            origin.position.copy(last_grounded_pos_with_offset);
            // TODO: fade out and in
        }

        const capsule_translation = capsule_body.translation();
        set_capsule_world_position(
            capsule_translation.x,
            capsule_translation.y,
            capsule_translation.z
        );
    });

    const mode = useSessionMode();
    return mode === "vr" ? (
        <VRJumpButton jump_pressed_ref={jump_pressed_ref} />
    ) : (
        <FlatJumpButton jump_pressed_ref={jump_pressed_ref} />
    );
};
