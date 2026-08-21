import type {
    CreatedEngineObject,
    EngineObjectModification,
    PartialTransform,
    Transform
} from "@hyperlinkvr/vr-engine-schemas";
import type { RapierRigidBody } from "@react-three/rapier";
import { Quaternion, Vector3 } from "three";

import type { ObjectRefsContextType } from "../contexts/ObjectRefsContext";
import { rotation_to_quaternion } from "../util/rotation";

const scratch_position = new Vector3();
const scratch_quaternion = new Quaternion();
const scratch_scale = new Vector3();

// refresh reads physics body if present, else the group's world matrix (scale is always from the group, since physics doesn't affect scale)
export const sample_live_transform = (refs: ObjectRefsContextType): Transform => {
    const body = refs.rigid_body.current;
    const group = refs.root.current;

    let scale: [number, number, number] = [1, 1, 1];
    if (group) {
        group.getWorldScale(scratch_scale);
        scale = [scratch_scale.x, scratch_scale.y, scratch_scale.z];
    }

    if (body) {
        const translation = body.translation();
        const rotation = body.rotation();
        return {
            position: [translation.x, translation.y, translation.z],
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
            scale
        };
    }

    if (!group) {
        throw new Error("Object has neither a body nor a root group to sample");
    }

    group.getWorldPosition(scratch_position);
    group.getWorldQuaternion(scratch_quaternion);
    return {
        position: [scratch_position.x, scratch_position.y, scratch_position.z],
        rotation: [
            scratch_quaternion.x,
            scratch_quaternion.y,
            scratch_quaternion.z,
            scratch_quaternion.w
        ],
        scale
    };
};

const rigid_body_type = (stored: CreatedEngineObject): string | undefined =>
    stored.object.type === "custom"
        ? stored.object.physics?.rigid_body?.type
        : undefined;

// fixed / dynamic / kinematic-vel own their pose, kinematic-pos follows the group
const body_owns_pose = (body: RapierRigidBody | null, rb_type?: string): boolean =>
    !!body && rb_type !== "kinematic-pos";

// same check but upon the refs context
export const body_owns_pose_for = (refs: ObjectRefsContextType): boolean => {
    const body = refs.rigid_body.current;
    if (!body) return false;

    return body.bodyType() !== 2; // 2 === KinematicPositionBased in rapier
};

const teleport_body = (
    body: RapierRigidBody,
    transform: PartialTransform
): void => {
    if (transform.position) {
        body.setTranslation(
            { x: transform.position[0], y: transform.position[1], z: transform.position[2] },
            true
        );
    }
    if (transform.rotation) {
        rotation_to_quaternion(transform.rotation, scratch_quaternion);
        body.setRotation(
            {
                x: scratch_quaternion.x,
                y: scratch_quaternion.y,
                z: scratch_quaternion.z,
                w: scratch_quaternion.w
            },
            true
        );
    }

    // dynamic bodies keep momentum from the old spot unless we clear it.
    // read from rapier, not user specified rb type, as prefabs don't set that
    if (body.bodyType() === 0) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // ignore scale, handled by body
};

// returns the new object to commit to store, as well as updating the live object if it has a physics body and owns its pose
export const apply_modification = (
    stored: CreatedEngineObject,
    changes: EngineObjectModification,
    refs: ObjectRefsContextType | null
): CreatedEngineObject => {
    const body = refs?.rigid_body.current ?? null;
    const declared_rb_type = rigid_body_type(stored);
    const body_authority = body_owns_pose(body, declared_rb_type);

    if (changes.transform && body_authority && body) {
        teleport_body(body, changes.transform);

        // scale still belongs to the group even for physics objects
        if (changes.transform.scale && refs?.root.current) {
            refs.root.current.scale.set(
                changes.transform.scale[0],
                changes.transform.scale[1],
                changes.transform.scale[2]
            );
        }
    }

    if (changes.physics && body_authority && body) {
        // resolve actual body type from rapier to include prefabs (as they don't delcare an rb_type)
        const is_dynamic = body.bodyType() === 0;
        const is_kinematic_vel = body.bodyType() === 3;

        if (changes.physics.velocity) {
            if (is_dynamic || is_kinematic_vel) {
                body.setLinvel(
                    {
                        x: changes.physics.velocity[0],
                        y: changes.physics.velocity[1],
                        z: changes.physics.velocity[2]
                    },
                    true
                );
            } else {
                console.warn("Ignoring velocity change for object that is not dynamic or kinematic-vel");
            }
        }

        if (changes.physics.angular_velocity) {
            if (is_dynamic || is_kinematic_vel) {
                body.setAngvel(
                    {
                        x: changes.physics.angular_velocity[0],
                        y: changes.physics.angular_velocity[1],
                        z: changes.physics.angular_velocity[2]
                    },
                    true
                );
            } else {
                console.warn("Ignoring angular velocity change for object that is not dynamic or kinematic-vel");
            }
        }

        if (changes.physics.impulse) {
            if (is_dynamic) {
                body.applyImpulse(
                    {
                        x: changes.physics.impulse[0],
                        y: changes.physics.impulse[1],
                        z: changes.physics.impulse[2]
                    },
                    true
                );
            } else {
                console.warn("Ignoring impulse for object that is not dynamic");
            }
        }

        if (changes.physics.torque_impulse) {
            if (is_dynamic) {
                body.applyTorqueImpulse(
                    {
                        x: changes.physics.torque_impulse[0],
                        y: changes.physics.torque_impulse[1],
                        z: changes.physics.torque_impulse[2]
                    },
                    true
                );
            } else {
                console.warn("Ignoring torque impulse for object that is not dynamic");
            }
        }
    }

    return {
        ...stored,
        transform: body_authority
            ? stored.transform
            : { ...stored.transform, ...changes.transform },
        user_data: changes.user_data !== undefined ? changes.user_data : stored.user_data,
        monitors: changes.monitors ?? stored.monitors
    };
};
