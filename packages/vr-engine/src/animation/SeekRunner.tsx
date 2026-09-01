import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

import type { ObjectRefsContextType } from "../contexts/ObjectRefsContext";
import { body_owns_pose_for } from "../engine/object_modification";
import { get_object_refs } from "../engine/object_ref_registry";
import { get_player_position } from "../player/player_position_registry";
import type { ActiveSeek } from "./seek_registry";
import { cancel_active_seek, get_active_seeks } from "./seek_registry";

const cur = new Vector3(), tgt = new Vector3(), aim = new Vector3();
const dir = new Vector3(), tvel = new Vector3(), flat = new Vector3();

// read a position from the same place the runner writes it
const read_position = (refs: ObjectRefsContextType, out: Vector3): boolean => {
    const body = refs.rigid_body.current;
    if (body && body_owns_pose_for(refs)) {
        const t = body.translation();
        out.set(t.x, t.y, t.z);
        return true;
    }
    const g = refs.root.current;
    if (!g) return false;
    g.getWorldPosition(out);
    return true;
};

const resolve_target = (seek: ActiveSeek, out: Vector3): boolean => {
    if (seek.target.kind === "point") {
        out.set(...seek.target.position);
        return true;
    }
    if (seek.target.kind === "player") return get_player_position(out);
    const t = get_object_refs(seek.target.object_id)?.current;
    return !!t && read_position(t, out);
};

export const SeekRunner = () => {
    useFrame((_, delta) => {
        const active = get_active_seeks();
        if (active.size === 0 || delta <= 0) return;

        for (const [id, seek] of active) {
            const refs = get_object_refs(id)?.current;
            if (!refs) {
                cancel_active_seek(id);
                continue;
            }
            if (!read_position(refs, cur)) continue;
            if (!resolve_target(seek, tgt)) {
                cancel_active_seek(id);
                continue;
            }

            // where we actually steer
            aim.copy(tgt);
            if (seek.strategy === "predict") {
                if (seek.last_target) {
                    tvel.subVectors(tgt, seek.last_target).divideScalar(delta);
                    seek.est_vel.lerp(tvel, 0.25); // smoothing
                }
                (seek.last_target ??= new Vector3()).copy(tgt);
                let lead = cur.distanceTo(tgt) / seek.speed; // time-to-intercept
                if (seek.lead_max) lead = Math.min(lead, seek.lead_max);
                aim.addScaledVector(seek.est_vel, lead);
            }

            dir.subVectors(aim, cur);
            if (seek.lock_y) dir.y = 0;

            const body = refs.rigid_body.current;

            // arrival tests the real target, not predicted point
            const real_dist = seek.lock_y
                ? Math.hypot(tgt.x - cur.x, tgt.z - cur.z)
                : cur.distanceTo(tgt);

            if (real_dist <= seek.distance) {
                if (seek.mode === "dynamic" && body) {
                    const v = body.linvel();
                    body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
                }

                if (seek.stop_at_distance) {
                    seek.on_arrive?.();
                    cancel_active_seek(id);
                    continue;
                }
            } else {
                dir.normalize();

                if (seek.mode === "dynamic" && body) {
                    // steer horizontal velocity, let gravity and collisions handle vertical
                    // TODO: might not be perfect, worth testing
                    const v = body.linvel();
                    body.setLinvel(
                        { x: dir.x * seek.speed, y: v.y, z: dir.z * seek.speed },
                        true
                    );
                } else {
                    // write directly to the body like an animation, not responding to physics
                    cur.addScaledVector(
                        dir,
                        Math.min(seek.speed * delta, real_dist - seek.distance)
                    );
                    if (body_owns_pose_for(refs) && body) {
                        body.setTranslation({ x: cur.x, y: cur.y, z: cur.z }, true);
                        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                    } else if (refs.root.current) {
                        refs.root.current.position.copy(cur);
                    }
                }
            }

            // facing runs whether moving or holding, ignoring if the object is effectively at the target (to avoid jitter)
            if (seek.face_target && refs.root.current && real_dist > 1e-3) {
                flat.set(tgt.x, seek.lock_y ? cur.y : tgt.y, tgt.z);
                refs.root.current.lookAt(flat);
            }
        }
    });
    return null;
};
