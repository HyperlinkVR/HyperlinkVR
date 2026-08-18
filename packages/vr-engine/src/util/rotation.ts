import {EULER_ORDER} from "../consts";
import {Euler, Quaternion} from "three";

import {Rotation} from "@hyperlinkvr/vr-engine-schemas";

const scratch_euler = new Euler();

export const rotation_to_quaternion = (rotation: Rotation, out: Quaternion): Quaternion => {
    if (rotation.length === 4) {
        return out.set(rotation[0], rotation[1], rotation[2], rotation[3]);
    }
    scratch_euler.set(rotation[0], rotation[1], rotation[2], EULER_ORDER);
    return out.setFromEuler(scratch_euler);
};

export const rotation_to_euler = (rotation: Rotation, out: Euler): Euler => {
    if (rotation.length === 4) {
        out.setFromQuaternion(new Quaternion(rotation[0], rotation[1], rotation[2], rotation[3]), EULER_ORDER);
        return out;
    }
    return out.set(rotation[0], rotation[1], rotation[2], EULER_ORDER);
};

const scratch_quat = new Quaternion();
export const rotation_to_quaternion_array = (rotation: Rotation): [number, number, number, number] => {
    rotation_to_quaternion(rotation, scratch_quat);
    return [scratch_quat.x, scratch_quat.y, scratch_quat.z, scratch_quat.w];
};
