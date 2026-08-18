import {useRapier} from "@react-three/rapier";
import type {RapierRigidBody} from "@react-three/rapier";
import {useEffect} from "react";
import type {RefObject} from "react";
import type {HingeConstraint} from "@hyperlinkvr/vr-engine-schemas";

const AXIS_VECTORS = {
    x: {x: 1, y: 0, z: 0},
    y: {x: 0, y: 1, z: 0},
    z: {x: 0, y: 0, z: 1}
} as const;

const ZERO = {x: 0, y: 0, z: 0};

export const useWorldHinge = (
    body_ref: RefObject<RapierRigidBody | null>,
    constrained_ref: RefObject<boolean> | undefined,
    constraint: HingeConstraint | undefined
) => {
    const {world, rapier} = useRapier();

    useEffect(() => {
        const body = body_ref.current;
        if (!body || !constraint) {
            return;
        }

        // anchor copies the full spawn pose, not just translation, otherwise the joint frames disagree on a rotated spawn and the axis skews
        const translation = body.translation();
        const rotation = body.rotation();
        const anchor_body = world.createRigidBody(
            rapier.RigidBodyDesc.fixed()
                .setTranslation(translation.x, translation.y, translation.z)
                .setRotation(rotation)
        );

        const params = rapier.JointData.revolute(ZERO, ZERO, AXIS_VECTORS[constraint.axis]);
        if (constraint.limits) {
            params.limitsEnabled = true;
            params.limits = [constraint.limits.min, constraint.limits.max];
        }

        const joint = world.createImpulseJoint(params, anchor_body, body, true);

        if (constraint.spring) {
            (joint as InstanceType<typeof rapier.RevoluteImpulseJoint>).configureMotorPosition(
                constraint.spring.target,
                constraint.spring.stiffness,
                constraint.spring.damping
            );
        }

        if (constrained_ref) {
            constrained_ref.current = true;
        }

        return () => {
            if (constrained_ref) {
                constrained_ref.current = false;
            }
            world.removeImpulseJoint(joint, true);
            world.removeRigidBody(anchor_body);
        };
    }, [body_ref, constrained_ref, constraint, world, rapier]);
};
