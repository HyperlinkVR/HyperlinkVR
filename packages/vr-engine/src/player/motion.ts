import {Vector3} from "three";

const requested_movement = new Vector3();

export const request_player_movement = (delta_x: number, delta_z: number) => {
    requested_movement.x += delta_x;
    requested_movement.z += delta_z;
};

export const consume_player_movement = (out: Vector3) => {
    out.copy(requested_movement);
    requested_movement.set(0, 0, 0);
    return out;
};


const capsule_world_position = new Vector3();
export const CAPSULE_RADIUS = 0.3;

// the player capsule's height follows the head, within these bounds (shared by the local character
// controller and remote players' collision capsules, so both are the same shape)
export const MIN_PLAYER_HEIGHT = 0.6;   // crouched / seated floor
export const MAX_PLAYER_HEIGHT = 2.2;   // sanity ceiling (bad tracking, standing on a chair)
export const HEAD_CLEARANCE = 0.1;      // eyes aren't at the crown of your head

export const player_capsule_half_height = (head_y: number, origin_y: number) => {
    const height = Math.min(MAX_PLAYER_HEIGHT, Math.max(MIN_PLAYER_HEIGHT, head_y - origin_y + HEAD_CLEARANCE));
    return Math.max(0.05, height / 2 - CAPSULE_RADIUS);
};

export const set_capsule_world_position = (x: number, y: number, z: number) => {
    capsule_world_position.set(x, y, z);
};

export const get_capsule_world_position = (out: Vector3) => {
    return out.copy(capsule_world_position);
};
