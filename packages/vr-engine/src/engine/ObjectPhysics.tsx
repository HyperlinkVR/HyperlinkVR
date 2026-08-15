import {
    AssetRef,
    Collider,
    PhysicsSystem,
    RigidBody as RigidBodyConfig,
    Transform
} from "@hyperlinkvr/vr-engine-schemas";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
    BallCollider, CapsuleCollider, CollisionEnterPayload, CollisionPayload, CuboidCollider,
    CylinderCollider, MeshCollider, RapierRigidBody, RigidBody, RigidBodyAutoCollider, useRapier
} from "@react-three/rapier";
import {ComponentProps, useCallback, useEffect, useMemo, useRef} from "react";
import {Group, MeshBasicMaterial, Quaternion, Vector3, Mesh, EulerOrder, Euler} from "three";

import { clone } from "three/examples/jsm/utils/SkeletonUtils"

import { useObjectRefsOptional } from "../contexts/ObjectRefsContext";
import {rotation_to_euler, rotation_to_quaternion_array} from "./rotation";
import {useObjectBinding} from "../hooks/useObjectBinding";
import {useWorldHinge} from "./physics_constraints";
import {useAssetURL} from "../hooks/useAssetURL";


const RB_TYPE = {
    fixed: "fixed",
    dynamic: "dynamic",
    "kinematic-pos": "kinematicPosition",
    "kinematic-vel": "kinematicVelocity"
} as const;

export const useKinematicPosition = (
    rb_ref: React.RefObject<RapierRigidBody | null>,
    rb: RigidBodyConfig,
    container_ref: React.RefObject<Group | null>
) => {
    const target_pos = useMemo(() => new Vector3(), []);
    const target_quat = useMemo(() => new Quaternion(), []);

    useFrame(() => {
        if (rb.type !== "kinematic-pos" || !rb_ref.current || !container_ref.current) {
            return;
        }

        // copy world transform of container to kinematic-pos rigid body
        //container_ref.current.updateWorldMatrix(true, false);

        container_ref.current.getWorldPosition(target_pos);
        container_ref.current.getWorldQuaternion(target_quat);

        rb_ref.current.setNextKinematicTranslation(target_pos);
        rb_ref.current.setNextKinematicRotation(target_quat);
    }, -1);
};

export const useKinematicVelocity = (
    ref: React.RefObject<RapierRigidBody | null>,
    rb: RigidBodyConfig
) => {
    useEffect(() => {
        if (rb.type !== "kinematic-vel" || !ref.current) return;
        ref.current.setLinvel(
            { x: rb.velocity[0], y: rb.velocity[1], z: rb.velocity[2] },
            true
        );
    }, [ref, rb]);
};

interface ColliderProps {
    position?: [number, number, number];
    rotation?: [number, number, number] | [number, number, number, EulerOrder];
}

export const PrimitiveCollider = ({ collider, ...rest }: ColliderProps & { collider: Collider }) => {
    switch (collider.type) {
        case "box":
            return (
                <CuboidCollider
                    args={[
                        collider.size[0] / 2,
                        collider.size[1] / 2,
                        collider.size[2] / 2
                    ]}
                    {...rest}
                />
            );
        case "sphere":
            return <BallCollider args={[collider.radius]} {...rest} />;
        case "capsule":
            return <CapsuleCollider args={[collider.height / 2, collider.radius]} {...rest} />;
        case "cylinder":
            return <CylinderCollider args={[collider.height / 2, collider.radius]} {...rest} />;
        default:
            return null;
    }
};

const INVISIBLE_MATERIAL = new MeshBasicMaterial({ visible: false });

export const URLMeshCollider = ({
    asset_ref,
    approximation,
    ...rest
}: ColliderProps & {
    asset_ref: AssetRef;
    approximation: string;
}) => {
    const resolved_url = useAssetURL(asset_ref);
    if (!resolved_url) {
        console.warn(`URLMeshCollider: failed to resolve asset_ref ${asset_ref}`);
        return null;
    }

    const { scene } = useGLTF(resolved_url);
    const instance = useMemo(() => {
        const cloned = clone(scene);

        cloned.traverse((object) => {
            const mesh = object as Mesh;
            if (mesh.isMesh) {
                mesh.material = INVISIBLE_MATERIAL;
            }
        });

        return cloned;
    }, [scene]);

    return (
        // TODO: fix typing
        <MeshCollider type={approximation as any} {...rest}>
            <primitive object={instance} />
        </MeshCollider>
    );
};

const arrays_equal = (left: readonly unknown[], right: readonly unknown[]): boolean => {
    if (left.length !== right.length) return false;

    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) return false;
    }

    return true;
};

const colliders_equal = (left: Collider, right: Collider): boolean => {
    const left_keys = Object.keys(left);
    if (left_keys.length !== Object.keys(right).length) return false;

    for (const key of left_keys) {
        const left_value = (left as Record<string, unknown>)[key];
        const right_value = (right as Record<string, unknown>)[key];

        if (Array.isArray(left_value) && Array.isArray(right_value)) {
            if (!arrays_equal(left_value, right_value)) return false;
            continue;
        }

        if (left_value !== right_value) return false;
    }

    return true;
};

const useStableCollider = (collider: Collider): Collider => {
    const stable = useRef(collider);

    if (stable.current !== collider && !colliders_equal(stable.current, collider)) {
        stable.current = collider;
    }

    return stable.current;
};

export const useCollider = (collider: Collider): {auto_strategy: RigidBodyAutoCollider | false, ColliderComponent: React.ComponentType<ColliderProps> | null} => {
    const stable_collider = useStableCollider(collider);
    const auto_strategy = stable_collider.type === "auto" ? (stable_collider.approximation as any) : false;

    const ColliderComponent = useMemo(() => {
        switch (stable_collider.type) {
            case "custom-mesh":
                return (props: ColliderProps) => <URLMeshCollider asset_ref={stable_collider.mesh} approximation={stable_collider.approximation || "hull"} {...props} />;
            case "box":
            case "sphere":
            case "capsule":
            case "cylinder":
                return (props: ColliderProps) => <PrimitiveCollider collider={stable_collider} {...props} />;
            default:
                return null;
        }
    }, [stable_collider]);

    return { auto_strategy, ColliderComponent };
}

export const get_collider_extents = (collider: Collider): {x: number, y: number, z: number} | undefined => {
    switch (collider.type) {
        case "box":
            return { x: collider.size[0], y: collider.size[1], z: collider.size[2] };
        case "sphere":
            return { x: collider.radius * 2, y: collider.radius * 2, z: collider.radius * 2 };
        case "capsule":
            return { x: collider.radius * 2, y: collider.height + collider.radius * 2, z: collider.radius * 2 };
        case "cylinder":
            return { x: collider.radius * 2, y: collider.height, z: collider.radius * 2 };
        default:
            return undefined;
    }
}

type CollisionInfo<T extends number | undefined> = {
    type: "enter";
    other_object_id: string | null;
    contact_point: { x: number, y: number, z: number };
    contact_normal: { x: number, y: number, z: number };
    relative_velocity: { x: number, y: number, z: number };
    impulse: { x: number, y: number, z: number };
    force: T extends number ? { x: number, y: number, z: number } : undefined;
}

export const get_collision_info = <T extends number | undefined>({ manifold, other, target }: CollisionEnterPayload, timestep?: T): CollisionInfo<T> => {
    const this_body = target.rigidBody;
    const other_body = other.rigidBody;

    let total_impulse = 0;
    const contact_count = manifold.numContacts();
    for (let index = 0; index < contact_count; index++) {
        total_impulse += manifold.contactImpulse(index);
    }

    const normal = manifold.normal();

    const impulse = {
        x: normal.x * total_impulse,
        y: normal.y * total_impulse,
        z: normal.z * total_impulse,
    }

    let force: {x: number, y: number, z: number} | undefined = undefined;
    if (timestep !== undefined) {
        const force_magnitude = total_impulse / timestep;
        force = {
            x: normal.x * force_magnitude,
            y: normal.y * force_magnitude,
            z: normal.z * force_magnitude,
        };
    }

    const solver_point = manifold.numSolverContacts() > 0 ? manifold.solverContactPoint(0) : null;
    const contact_point = solver_point
        ? { x: solver_point.x, y: solver_point.y, z: solver_point.z }
        : { x: 0, y: 0, z: 0 };

    const this_vel = this_body ? this_body.linvel() : { x: 0, y: 0, z: 0 };
    const other_vel = other_body ? other_body.linvel() : { x: 0, y: 0, z: 0 };
    const relative_vel = {
        x: this_vel.x - other_vel.x,
        y: this_vel.y - other_vel.y,
        z: this_vel.z - other_vel.z,
    };

    // TODO: better way to get obj root
    const other_object_id = other.rigidBodyObject?.parent?.parent?.userData?.object_id || null;

    return {
        type: "enter" as const,
        other_object_id,
        contact_point: contact_point,
        contact_normal: { x: normal.x, y: normal.y, z: normal.z },
        relative_velocity: relative_vel,
        force,
        impulse
    } as CollisionInfo<T>;
}


const get_body_props = (rb: RigidBodyConfig): Partial<ComponentProps<typeof RigidBody>> => {
    const restituton_rules = {
        "average": 0,
        "min": 1,
        "multiply": 2,
        "max": 3
    }

    const base_props: Partial<ComponentProps<typeof RigidBody>> = {
        restitution: rb.restitution,
        restitutionCombineRule: rb.restitution_combine_rule ? restituton_rules[rb.restitution_combine_rule] : undefined,
        friction: rb.friction,
        linearDamping: rb.linear_damping,
        angularDamping: rb.angular_damping,
    };

    const strip_undefined = (obj: any) => {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
    }

    if (rb.type === "dynamic") {
        const axis_locks = rb.constraint?.type === "axis-locks" ? rb.constraint : undefined;
        const locked_rotation = axis_locks?.rotation ?? {x: false, y: false, z: false};
        const locked_translation = axis_locks?.translation ?? {x: false, y: false, z: false};

        return strip_undefined({
            ...base_props,
            linearVelocity: rb.velocity,
            angularVelocity: rb.angular_velocity,
            mass: rb.mass,
            gravityScale: rb.gravity_scale,
            ccd: rb.ccd,
            enabledRotations: [!locked_rotation.x, !locked_rotation.y, !locked_rotation.z],
            enabledTranslations: [!locked_translation.x, !locked_translation.y, !locked_translation.z],
        });
    } else if (rb.type === "kinematic-vel") {
        return strip_undefined({
            ...base_props,
            linearVelocity: rb.velocity,
            angularVelocity: rb.angular_velocity,
        });
    } else if (rb.type === "kinematic-pos" || rb.type === "fixed") {
        return strip_undefined(base_props);
    }

    return {};
}

export const ObjectPhysics = ({
    physics,
    children = null,
    body_name,
    kinematic_pos_tracking_ref,
    transform,
    collision_groups,
    on_collision_enter,
    on_collision_exit
}: {
    physics: PhysicsSystem;
    children?: React.ReactNode;
    body_name?: string;
    kinematic_pos_tracking_ref?: React.RefObject<Group | null>;
    transform?: Transform
    collision_groups?: number;
    on_collision_enter?: (payload: CollisionEnterPayload) => void;
    on_collision_exit?: (payload: CollisionPayload) => void;
}) => {
    const refs = useObjectRefsOptional();

    const rb = physics.rigid_body ?? { type: "fixed" as const };

    const local_ref = useRef<RapierRigidBody>(null);
    const rb_ref = refs?.rigid_body || local_ref;

    const container_ref = useRef<Group>(null);

    const collider: Collider = rb.collider ?? {
        type: "auto",
        approximation: rb.type === "fixed" ? "trimesh" : "hull"
    };

    if (collider.type === "auto" && !children) {
        console.warn(`RigidBody "${body_name || "unnamed"}" has auto collider but no children to generate colliders from. This may result in no colliders being generated.`);
    }

    const { auto_strategy, ColliderComponent } = useCollider(collider);

    const { world } = useRapier();

    const collision_group_props = collision_groups !== undefined ? { collisionGroups: collision_groups } : {};

    const {emit_report} = useObjectBinding(physics.binding);

    useKinematicPosition(rb_ref, rb, kinematic_pos_tracking_ref || container_ref);
    useKinematicVelocity(rb_ref, rb);
    useWorldHinge(
        rb_ref,
        refs?.constrained,
        rb.type === "dynamic" && rb.constraint?.type === "hinge" ? rb.constraint : undefined
    ); // TODO: unified useContsraints hook that automatically handles all constraint types
    // usePhysicsReporting(rbRef, physics, monitors, id); // TODO: implement

    const collider_rot_euler = useMemo(() => {
        if (!collider.rotation) return [0, 0, 0] as [number, number, number];

        const euler = new Euler();
        rotation_to_euler(collider.rotation, euler);
        return [euler.x, euler.y, euler.z, euler.order] as [number, number, number, EulerOrder];
    }, [collider.rotation]);

    const report_collision_enter = useCallback(
        (payload: CollisionEnterPayload) => {
            if (!physics.report_collisions) {
                on_collision_enter?.(payload);
                return;
            }

            const event_payload = get_collision_info(payload, world.timestep);
            emit_report({
                kind: "physics-collision",
                payload: event_payload
            });

            on_collision_enter?.(payload);
        },
        [world, physics.report_collisions, emit_report, on_collision_enter]
    );

    const report_collision_exit = useCallback(
        (payload: CollisionPayload) => {
            if (!physics.report_collisions) {
                on_collision_exit?.(payload);
                return;
            }

            // TODO: better way to get obj root
            const other_object_id = payload.other.rigidBodyObject?.parent?.parent?.userData?.object_id || null;

            emit_report({
                kind: "physics-collision",
                payload: {
                    type: "exit",
                    other_object_id
                }
            });

            on_collision_exit?.(payload);
        },
        [physics.report_collisions, emit_report, on_collision_exit]
    );

    return (
        <group ref={container_ref}>
            <RigidBody
                ref={rb_ref}
                name={body_name}
                type={RB_TYPE[rb.type]}
                position={transform?.position}
                quaternion={transform ? rotation_to_quaternion_array(transform.rotation) : undefined}
                colliders={auto_strategy}

                {...collision_group_props}
                {...get_body_props(rb)}

                onCollisionEnter={report_collision_enter}
                onCollisionExit={report_collision_exit}
            >
                {ColliderComponent && <ColliderComponent position={collider.offset} rotation={collider_rot_euler} />}
                {children}
            </RigidBody>
        </group>
    );
};

// TODO: option to ignore player collisions, and option to allow players to pass through objects
