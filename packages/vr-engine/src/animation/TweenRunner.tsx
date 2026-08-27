import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";

import { get_object_refs } from "../engine/object_ref_registry";
import { get_active_tweens, cancel_active_tween } from "./tween_registry";
import { rotation_to_quaternion } from "../util/rotation";
import { body_owns_pose_for } from "../engine/object_modification";
import type {TweenEasing} from "@hyperlinkvr/vr-engine-schemas";

const from_pos = new Vector3();
const to_pos = new Vector3();
const cur_pos = new Vector3();

const from_quat = new Quaternion();
const to_quat = new Quaternion();
const cur_quat = new Quaternion();

const from_scale = new Vector3();
const to_scale = new Vector3();
const cur_scale = new Vector3();

const EASING: Record<TweenEasing, (t: number) => number> = {
    linear: (t) => t,
    "ease-in": (t) => t * t,
    "ease-out": (t) => t * (2 - t),
    "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)
};

export const TweenRunner = () => {
    useFrame(() => {
        const active = get_active_tweens();
        if (active.size === 0) return;

        const now = performance.now();

        for (const [id, tween] of active) {
            const refs = get_object_refs(id);
            if (!refs) {
                cancel_active_tween(id);
                continue;
            }

            const raw = Math.min((now - tween.start_ms) / tween.duration_ms, 1);
            const k = EASING[tween.easing](raw);

            // interpolate position
            from_pos.set(...tween.from.position);
            to_pos.set(...tween.to.position);
            cur_pos.lerpVectors(from_pos, to_pos, k);

            // interpolate rotation via slerp
            rotation_to_quaternion(tween.from.rotation, from_quat);
            rotation_to_quaternion(tween.to.rotation, to_quat);
            cur_quat.copy(from_quat).slerp(to_quat, k);

            // interpolate scale
            from_scale.set(...tween.from.scale);
            to_scale.set(...tween.to.scale);
            cur_scale.lerpVectors(from_scale, to_scale, k);

            const body = refs.rigid_body.current;

            if (body_owns_pose_for(refs) && body) {
                body.setTranslation({ x: cur_pos.x, y: cur_pos.y, z: cur_pos.z }, true);
                body.setRotation(
                    { x: cur_quat.x, y: cur_quat.y, z: cur_quat.z, w: cur_quat.w },
                    true
                );

                // keep it from drifting under simulation during the tween
                body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                if (refs.root.current) {
                    refs.root.current.scale.copy(cur_scale);
                }
            } else if (refs.root.current) {
                refs.root.current.position.copy(cur_pos);
                refs.root.current.quaternion.copy(cur_quat);
                refs.root.current.scale.copy(cur_scale);
            }

            if (raw >= 1) {
                tween.on_complete();
                cancel_active_tween(id);
            }
        }
    });

    return null;
};
