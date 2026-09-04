import { useSetting } from "@hyperlinkvr/react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group} from "three";
import { Euler, Quaternion, Vector3 } from "three";

import { useFlatFrameInput } from "../input/impl/flat/bindings";
import { get_active_seat } from "./seating";


const BASE_YAW_RADIANS = 0.022 * (Math.PI / 180);

const PITCH_LIMIT = Math.PI / 2 - 0.01;

const TURN_FRAME_LIMIT = Math.PI / 3;

const PHOTO_FLY_SPEED = 4; // units/sec, sprint multiplies this
const PHOTO_SPRINT_MULT = 5;

const wrap_angle = (angle: number): number => {
    const two_pi = Math.PI * 2;
    let wrapped = (angle + Math.PI) % two_pi;
    if (wrapped < 0) wrapped += two_pi;
    return wrapped - Math.PI;
};

export const FlatCameraRig = ({ origin }: { origin: React.RefObject<Group | null>; }) => {
    const { camera } = useThree();
    const input = useFlatFrameInput();

    const pitch = useRef(0);
    const head = useMemo(() => new Vector3(), []);

    const seat_quat = useMemo(() => new Quaternion(), []);
    const seat_euler = useMemo(() => new Euler(0, 0, 0, "YXZ"), []);

    const [player_height_cm] = useSetting("player_height_cm");
    const [sensitivity] = useSetting("flat_sensitivity");

    const [devtools_photo_mode] = useSetting("devtools_flat_photo_mode");
    // TODO: fov control

    // free-fly camera position for photo mode, seeded from the live camera on entry
    const fly_pos = useMemo(() => new Vector3(), []);
    const fly_ready = useRef(false);

    useFrame((_, delta) => {
        if (!origin.current) return;

        const mult = BASE_YAW_RADIANS * sensitivity;

        let yaw_delta = input.look.x * mult;
        if (Math.abs(yaw_delta) > TURN_FRAME_LIMIT) {
            yaw_delta = Math.sign(yaw_delta) * TURN_FRAME_LIMIT;
        }

        let pitch_delta = input.look.y * mult;
        if (Math.abs(pitch_delta) > TURN_FRAME_LIMIT) {
            pitch_delta = Math.sign(pitch_delta) * TURN_FRAME_LIMIT;
        }

        // apply accumulated x delta to the origin's yaw
        origin.current.rotation.y -= yaw_delta;
        input.look.x = 0;

        // clamp yaw range relative to seat if set, otherwise leave free (seating is ignored while flying)
        const seat = devtools_photo_mode ? null : get_active_seat();
        if (seat && seat.yaw_range_rad) {
            seat.anchor.updateWorldMatrix(true, false);
            seat_quat.setFromRotationMatrix(seat.anchor.matrixWorld);
            seat_euler.setFromQuaternion(seat_quat, "YXZ");
            const base_yaw = seat_euler.y;

            const [min_offset, max_offset] = seat.yaw_range_rad;
            const offset = wrap_angle(origin.current.rotation.y - base_yaw);
            const clamped = Math.min(max_offset, Math.max(min_offset, offset));
            origin.current.rotation.y = base_yaw + clamped;
        }

        // apply accumulated y delta to the camera's pitch
        pitch.current -= pitch_delta;
        pitch.current = Math.max(
            -PITCH_LIMIT,
            Math.min(PITCH_LIMIT, pitch.current)
        );
        input.look.y = 0;

        // still need to apply the yaw to the camera as it isn't a child of the origin
        // TODO: is this problematic? maybe we should be parenting? using a separate camera? it means hud etc doesnt need to manually copy cam position, fine for now but worth investigating
        const yaw = origin.current.rotation.y;
        camera.rotation.set(pitch.current, yaw, 0, "YXZ");

        if (devtools_photo_mode) {
            // detach from the body and free-fly. reuse the rig's look handling above,
            // only the position integration differs from the grounded path
            if (!fly_ready.current) {
                fly_pos.copy(camera.position);
                fly_ready.current = true;
            }

            const speed = PHOTO_FLY_SPEED * delta * (input.sprint ? PHOTO_SPRINT_MULT : 1);

            // planar move is yaw-relative only, so flight stays level even when looking up/down
            fly_pos.x += (Math.cos(yaw) * input.move.x - Math.sin(yaw) * input.move.y) * speed;
            fly_pos.z += (-Math.sin(yaw) * input.move.x - Math.cos(yaw) * input.move.y) * speed;

            // vertical: jump/use ascends, grab descends (temp bindings until crouch exists)
            if (input.jump || input.use) fly_pos.y += speed;
            if (input.grab) fly_pos.y -= speed;

            camera.position.copy(fly_pos);
            return;
        }

        fly_ready.current = false;

        origin.current.getWorldPosition(head);
        head.y += (player_height_cm / 100) - 0.15;
        camera.position.copy(head);
    });

    return null;
};
