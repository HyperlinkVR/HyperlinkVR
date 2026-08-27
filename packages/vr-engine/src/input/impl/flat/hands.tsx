import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Group, Object3D} from "three";
import {Euler, MathUtils, Matrix4, Quaternion, Vector3} from "three";
import {
    make_button_state,
    update_button_state,
    useSetHands,
    type Hand,
    type HandPose
} from "../../hands";
import { useFlatFrameInput } from "./bindings";
import {FULL_THROW_CHARGE_S} from "../../values";

// carry slot: where held objects and the visible active hand sit, in camera space
const CARRY_OFFSET: [number, number, number] = [0.25, -0.25, -0.5];

const PASSIVE_HAND_OFFSET = new Vector3(-0.22, -0.35, -0.45); // left, down, forward of the head
const PASSIVE_HAND_REST_EULER = new Euler(-Math.PI / 6, 0.15, Math.PI / 12); // wrist tilt so the watch faces up-ish

const THROW_PULL_BACK = 0.22; // how far the carry slot retreats at full charge
const THROW_PULL_UP = 0.05; // slight raise while wound up, reads as a cock-back
const THROW_DRIVE_FORWARD = 0.35; // follow-through overshoot past the carry slot
const THROW_DRIVE_DURATION_S = 0.25;
const THROW_SHAKE_AMPLITUDE = 0.002;
const THROW_SHAKE_START = 0.85; // charge fraction where the strain shake fades in

const UNIT_SCALE = new Vector3(1, 1, 1);
const scratch_world_matrix = new Matrix4();

const write_world_transform = (
    node: Object3D,
    world_position: Vector3,
    world_quaternion: Quaternion
) => {
    node.matrixAutoUpdate = false;
    scratch_world_matrix.compose(world_position, world_quaternion, UNIT_SCALE);
    if (node.parent) {
        node.parent.updateWorldMatrix(true, false);
        node.matrix
            .copy(node.parent.matrixWorld)
            .invert()
            .multiply(scratch_world_matrix);
    } else {
        node.matrix.copy(scratch_world_matrix);
    }
    node.matrixWorldNeedsUpdate = true;
    node.updateWorldMatrix(false, false);
};

export const FlatHandsPublisher = () => {
    const set_hands = useSetHands();
    const { camera } = useThree();
    const flat_input = useFlatFrameInput();

    const active_grip = useRef<Group>(null);
    const active_ray = useRef<Group>(null);
    const active_pose = useRef<HandPose>({ kind: "curl", amount: 0 });
    const active_grab = useMemo(make_button_state, []);
    const active_trigger = useMemo(make_button_state, []);
    const active_throw = useMemo(make_button_state, []);
    const active_throw_charge = useRef(0);

    const held_throwable = useRef<boolean | null>(null);
    const was_charging = useRef(false);

    const throw_pull = useRef(0); // 0 to 1 smoothed wind-up amount
    const throw_drive_remaining = useRef(0); // seconds of follow-through left

    const active_hand = useMemo<Hand>(
        () => ({
            handedness: "right",
            grip: active_grip as RefObject<Object3D | null>,
            ray: active_ray as RefObject<Object3D | null>,
            grab: active_grab,
            trigger: active_trigger,
            pose: active_pose,
            throw_intent: {
                button: active_throw,
                charge_seconds: active_throw_charge,
                held_throwable: held_throwable
            }
        }),
        [active_grab, active_trigger, active_throw]
    );

    const passive_grip = useRef<Group>(null);
    const passive_ray = useRef<Object3D | null>(null); // stays null forever
    const passive_pose = useRef<HandPose>({ kind: "curl", amount: 0.15 });
    const passive_grab = useMemo(make_button_state, []);
    const passive_trigger = useMemo(make_button_state, []);

    const passive_hand = useMemo<Hand>(
        () => ({
            handedness: "left",
            grip: passive_grip as RefObject<Object3D | null>,
            ray: passive_ray,
            grab: passive_grab,
            trigger: passive_trigger,
            pose: passive_pose
        }),
        [passive_grab, passive_trigger]
    );

    useEffect(() => {
        set_hands(prev => [...prev, active_hand, passive_hand]);

        return () => {
            set_hands(prev => prev.filter(h => h !== active_hand && h !== passive_hand));
        };
    }, [active_hand, passive_hand, set_hands]);

    const scratch = useMemo(
        () => ({
            camera_world_position: new Vector3(),
            camera_world_quaternion: new Quaternion(),
            carry_world_position: new Vector3(),
            camera_yaw_euler: new Euler(0, 0, 0, "YXZ"),
            passive_yaw_quat: new Quaternion(),
            passive_rest_quat: new Quaternion(),
            passive_world_position: new Vector3(),
            passive_world_quaternion: new Quaternion()
        }),
        []
    );

    useFrame((state, delta) => {
        update_button_state(active_grab, flat_input.grab);
        update_button_state(active_trigger, flat_input.use);
        active_pose.current = {
            kind: "curl",
            amount: active_grab.pressed ? 1.2 : 0
        };
        // TODO: differentiate grab and point pose. vr should grab pose too

        update_button_state(active_throw, flat_input.throw_held);
        if (active_throw.just_pressed) {
            active_throw_charge.current = 0;
        } else if (active_throw.pressed) {
            active_throw_charge.current += delta;
        }

        // throw animation
        const charging = active_throw.pressed && held_throwable.current === true;
        const charge_fraction = Math.min(
            active_throw_charge.current / FULL_THROW_CHARGE_S,
            1
        );

        if (active_throw.just_released && was_charging.current) {
            throw_drive_remaining.current = THROW_DRIVE_DURATION_S;
        }
        was_charging.current = charging;

        // pull tracks the same sqrt curve as the physics, so the pose is a readout of how hard the throw will actually be
        const pull_target = charging ? Math.sqrt(charge_fraction) : 0;
        throw_pull.current = MathUtils.damp(
            throw_pull.current,
            pull_target,
            charging ? 20 : 30, // snappier decay on release than build-up
            delta
        );

        let drive_offset = 0;
        if (throw_drive_remaining.current > 0) {
            throw_drive_remaining.current = Math.max(throw_drive_remaining.current - delta, 0);

            const progress = 1 - throw_drive_remaining.current / THROW_DRIVE_DURATION_S;

            // snap forward fast then slowly return
            drive_offset = Math.sin(Math.pow(progress, 0.55) * Math.PI) * THROW_DRIVE_FORWARD;
        }

        let shake_x = 0;
        let shake_y = 0;
        const shake_strength = charging
            ? Math.max(0, (charge_fraction - THROW_SHAKE_START) / (1 - THROW_SHAKE_START))
            : 0;
        if (shake_strength > 0) {
            const shake_time = state.clock.elapsedTime;
            // different frequencies to ensure it doesn't look like a simple circular motion
            shake_x = Math.sin(shake_time * 61) * THROW_SHAKE_AMPLITUDE * shake_strength;
            shake_y = Math.sin(shake_time * 47 + 1.3) * THROW_SHAKE_AMPLITUDE * shake_strength;
        }

        camera.getWorldPosition(scratch.camera_world_position);
        camera.getWorldQuaternion(scratch.camera_world_quaternion);

        // crosshair ray
        if (active_ray.current) {
            write_world_transform(
                active_ray.current,
                scratch.camera_world_position,
                scratch.camera_world_quaternion
            );
        }

        if (active_grip.current) {
            scratch.carry_world_position
                .set(
                    CARRY_OFFSET[0] + shake_x,
                    CARRY_OFFSET[1] + shake_y + throw_pull.current * THROW_PULL_UP,
                    CARRY_OFFSET[2] + throw_pull.current * THROW_PULL_BACK - drive_offset
                )
                .applyMatrix4(camera.matrixWorld);

            write_world_transform(
                active_grip.current,
                scratch.carry_world_position,
                scratch.camera_world_quaternion
            );
        }

        // passive left hand follows camera yaw and tips a little
        if (passive_grip.current) {
            scratch.camera_yaw_euler.setFromQuaternion(
                scratch.camera_world_quaternion,
                "YXZ"
            );
            scratch.camera_yaw_euler.x = 0;
            scratch.camera_yaw_euler.z = 0;
            scratch.passive_yaw_quat.setFromEuler(scratch.camera_yaw_euler);

            scratch.passive_world_position
                .copy(PASSIVE_HAND_OFFSET)
                .applyQuaternion(scratch.passive_yaw_quat)
                .add(scratch.camera_world_position);

            scratch.passive_rest_quat.setFromEuler(PASSIVE_HAND_REST_EULER);
            scratch.passive_world_quaternion
                .copy(scratch.passive_yaw_quat)
                .multiply(scratch.passive_rest_quat);

            write_world_transform(
                passive_grip.current,
                scratch.passive_world_position,
                scratch.passive_world_quaternion
            );
        }
    });

    return (
        <>
            <group ref={active_grip} />
            <group ref={active_ray} />
            <group ref={passive_grip} />
        </>
    );
};
