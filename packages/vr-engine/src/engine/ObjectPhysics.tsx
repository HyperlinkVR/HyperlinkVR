import { AssetRef, Collider, ColliderOrCollection, PhysicsSystem, RigidBody as RigidBodyConfig, Rotation, Transform } from "@hyperlinkvr/vr-engine-schemas";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { BallCollider, CapsuleCollider, CollisionEnterPayload, CollisionPayload, CuboidCollider, CylinderCollider, MeshCollider, RapierRigidBody, RigidBody, RigidBodyAutoCollider, useRapier } from "@react-three/rapier";
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Euler, EulerOrder, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils";



import { EULER_ORDER } from "../consts";
import { useObjectRefsOptional } from "../contexts/ObjectRefsContext";
import { useAssetURL } from "../hooks/useAssetURL";
import { useObjectBinding } from "../hooks/useObjectBinding";
import { resolve_object_node } from "../interaction/util/target_resolution";
import { build_collision_groups, GROUP_PROP, GROUP_WORLD } from "../physics/collision_groups";
import { register_collider_collision_info } from "../physics/collision_hooks";
import { useWorldHinge } from "../physics/physics_constraints";
import {
    rotation_to_quaternion,
    rotation_to_quaternion_array
} from "../util/rotation";


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

    // skip redundant writes to the rigid body if the transform hasn't changed since the last write
    const written = useRef(false);
    const last_pos = useMemo(() => new Vector3(), []);
    const last_quat = useMemo(() => new Quaternion(), []);

    useFrame(() => {
        if (rb.type !== "kinematic-pos" || !rb_ref.current || !container_ref.current) {
            return;
        }

        // copy world transform of container to kinematic-pos rigid body
        //container_ref.current.updateWorldMatrix(true, false);

        container_ref.current.getWorldPosition(target_pos);
        container_ref.current.getWorldQuaternion(target_quat);

        // compare against the last written transform, not the last frame's, so sub-epsilon drift can't accumulate silently while the body sits idle
        const POS_EPS_SQ = 1e-12; // (1e-6 m)^2
        const QUAT_EPS = 1e-6;
        const still =
            written.current &&
            last_pos.distanceToSquared(target_pos) < POS_EPS_SQ &&
            Math.abs(last_quat.dot(target_quat)) > 1 - QUAT_EPS;

        if (still) return;

        rb_ref.current.setNextKinematicTranslation(target_pos);
        rb_ref.current.setNextKinematicRotation(target_quat);

        last_pos.copy(target_pos);
        last_quat.copy(target_quat);
        written.current = true;
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

const is_positive_finite = (value: number) => Number.isFinite(value) && value > 0;

export const PrimitiveCollider = ({ collider, ...rest }: ColliderProps & { collider: Collider }) => {
    switch (collider.type) {
        case "box": {
            const [sx, sy, sz] = collider.size;
            if (!is_positive_finite(sx) || !is_positive_finite(sy) || !is_positive_finite(sz)) {
                console.error("skipping degenerate box collider (a non-positive/non-finite size crashes the physics world)", collider.size);
                return null;
            }
            return (
                <CuboidCollider
                    args={[sx / 2, sy / 2, sz / 2]}
                    {...rest}
                />
            );
        }
        case "sphere":
            if (!is_positive_finite(collider.radius)) {
                console.error("skipping degenerate sphere collider (a non-positive/non-finite radius crashes the physics world)", collider.radius);
                return null;
            }
            return <BallCollider args={[collider.radius]} {...rest} />;
        case "capsule":
            if (!is_positive_finite(collider.height) || !is_positive_finite(collider.radius)) {
                console.error("skipping degenerate capsule collider (a non-positive/non-finite dimension crashes the physics world)", { height: collider.height, radius: collider.radius });
                return null;
            }
            return <CapsuleCollider args={[collider.height / 2, collider.radius]} {...rest} />;
        case "cylinder":
            if (!is_positive_finite(collider.height) || !is_positive_finite(collider.radius)) {
                console.error("skipping degenerate cylinder collider (a non-positive/non-finite dimension crashes the physics world)", { height: collider.height, radius: collider.radius });
                return null;
            }
            return <CylinderCollider args={[collider.height / 2, collider.radius]} {...rest} />;
        default:
            return null;
    }
};

const INVISIBLE_MATERIAL = new MeshBasicMaterial({ visible: false });

const URLMeshColliderInternal = ({ resolved_url, approximation, ...rest }: ColliderProps & { resolved_url: string; approximation: string }) => {
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
}

export const URLMeshCollider = ({
    asset_ref,
    approximation,
    ...rest
}: ColliderProps & {
    asset_ref: AssetRef | string;
    approximation: string;
}) => {
    const resolved_url = useAssetURL(asset_ref);
    if (resolved_url === null) {
        console.warn("URLMeshCollider: failed to resolve asset ref");
        return null;
    }

    if (resolved_url === undefined) {
        return null; // still loading
    }

    return <URLMeshColliderInternal resolved_url={resolved_url} approximation={approximation} {...rest} />;
};

const arrays_equal = (left: readonly unknown[], right: readonly unknown[]): boolean => {
    if (left.length !== right.length) return false;

    for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) return false;
    }

    return true;
};

const colliders_equal = (left: ColliderOrCollection, right: ColliderOrCollection): boolean => {
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

const useStableCollider = (collider: ColliderOrCollection): ColliderOrCollection => {
    const stable = useRef(collider);

    if (stable.current !== collider && !colliders_equal(stable.current, collider)) {
        stable.current = collider;
    }

    return stable.current;
};

type SingleColliderComponentProps = Omit<ColliderProps, "rotation"> & { collider: Collider, rotation?: Rotation, offset_base?: [number, number, number], rotation_base?: Rotation };

const SingleColliderComponent = ({ collider, position, rotation, rotation_base, offset_base, ...rest }: SingleColliderComponentProps) => {
    const euler_rot = useMemo(() => {
        const q_base = new Quaternion();
        if (rotation_base) rotation_to_quaternion(rotation_base, q_base);

        const q_local = new Quaternion();
        if (rotation) rotation_to_quaternion(rotation, q_local);

        const composed = q_base.multiply(q_local);
        const euler = new Euler().setFromQuaternion(composed, EULER_ORDER);

        // a non-finite rotation (e.g. a malformed rotation value) would give the collider a NaN world matrix, from which rapier decomposes a NaN scale and crashes
        if (!Number.isFinite(euler.x) || !Number.isFinite(euler.y) || !Number.isFinite(euler.z)) {
            console.error("collider has a non-finite rotation; falling back to identity", { rotation, rotation_base });
            return [0, 0, 0, EULER_ORDER] as [number, number, number, EulerOrder];
        }

        return [euler.x, euler.y, euler.z, euler.order] as [
            number,
            number,
            number,
            EulerOrder
        ];
    }, [rotation, rotation_base]);

    const offset = useMemo(() => {
        const base_offset = offset_base ?? [0, 0, 0];
        const pos_offset = position ?? [0, 0, 0];

        return [
            base_offset[0] + pos_offset[0],
            base_offset[1] + pos_offset[1],
            base_offset[2] + pos_offset[2]
        ] as [number, number, number];
    }, [position, offset_base]);

    switch (collider.type) {
        case "custom-mesh":
            return <URLMeshCollider asset_ref={collider.mesh} approximation={collider.approximation || "hull"} {...rest} position={offset} rotation={euler_rot} />;
        case "box":
        case "sphere":
        case "capsule":
        case "cylinder":
            return <PrimitiveCollider collider={collider} {...rest} position={offset} rotation={euler_rot} />;
        default:
            return null;
    }
}

// now only accepting offset and rotation on collider, not on the collidercomponent itself
type ColliderComponentProps = Omit<SingleColliderComponentProps, "collider">;

export const useCollider = (collider: ColliderOrCollection): {auto_strategy: RigidBodyAutoCollider | false, ColliderComponent: React.ComponentType<ColliderComponentProps> | null} => {
    const base_collider = useStableCollider(collider);
    const auto_strategy = base_collider.type === "auto" ? (base_collider.approximation as any) : false;

    const ColliderComponent = useMemo(() => {
        switch (base_collider.type) {
            case "custom-mesh":
            case "box":
            case "sphere":
            case "capsule":
            case "cylinder":
                return (props: ColliderComponentProps) => <SingleColliderComponent {...props} collider={base_collider} />;
            case "collection":
                return (props: ColliderComponentProps) => (<>
                    {base_collider.colliders.map((this_collider, index) => (
                        <SingleColliderComponent {...props} key={index} collider={this_collider} position={this_collider.offset} rotation={this_collider.rotation} offset_base={base_collider.offset} rotation_base={base_collider.rotation} />
                    ))}
                </>);
            default:
                return null;
        }
    }, [base_collider]);

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

    const other_object_id = resolve_object_node(other.rigidBodyObject ?? null)?.userData?.object_id ?? null;

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

    // kinematic-pos objects are posed by their owning group (refs.root) and driven each frame by
    // useKinematicPosition, so applying the dispatch transform to the body too would double it.
    // body-owned types (fixed/dynamic/kinematic-vel) place the body directly from the transform.
    const body_transform = rb.type === "kinematic-pos" ? undefined : transform;

    const local_ref = useRef<RapierRigidBody>(null);
    const rb_ref = refs?.rigid_body || local_ref;

    const container_ref = useRef<Group>(null);

    const collider: ColliderOrCollection = rb.collider ?? {
        type: "auto",
        approximation: rb.type === "fixed" ? "trimesh" : "hull"
    };

    if (collider.type === "auto" && !children) {
        console.warn(`RigidBody "${body_name || "unnamed"}" has auto collider but no children to generate colliders from. This may result in no colliders being generated.`);
    }

    if ((collider.type === "auto" || collider.type === "custom-mesh") && collider.approximation === "trimesh" && rb.type !== "fixed") {
        console.warn(
            `RigidBody "${body_name || "unnamed"}" has a collider with trimesh approximation but is not fixed. This may result in very poor performance. Change to a cheaper approximation (e.g. hull) or define a specific collider.`
        );
    }

    const { auto_strategy, ColliderComponent } = useCollider(collider);

    // a kinematic-pos body's pose is owned by its tracked group, and rapier writes the body pose back onto the RigidBody's object
    // if the visual sits inside the RigidBody while the tracked group (refs.root, via container_ref) is also animated, it gets rotated twice
    // render the visual outside the RigidBody in this case, so it only gets animated by the tracked group
    const decouple_visual = rb.type === "kinematic-pos" && !kinematic_pos_tracking_ref && !!ColliderComponent;

    const { world } = useRapier();

    // TODO: this is somewhat arbitrary, allow it to be overridden from sdk (maybe some fixed objects are indeed to be treated as props). otherwise could be lazy and rename the group to fixed and dynamic or something
    // an explicit collision group should win over the default assignment, which fixes hands being treated as props!
    const collision_group_props = useMemo(() => ({
        collisionGroups: collision_groups ?? build_collision_groups(
            rb.type === "fixed" ? GROUP_WORLD : GROUP_PROP,
            rb.collision_filter || {},
        )
    }), [collision_groups, rb.type, rb.collision_filter]);

   // wait for colliders to actually be created before registering collision info, otherwise colliders can be missed, or be without tags
    const [colliders_ready, setCollidersReady] = useState(false);
    useFrame(() => {
        if (colliders_ready) return;
        const body = rb_ref.current;
        if (body && body.numColliders() > 0) setCollidersReady(true);
    });

    useEffect(() => {
        const body = rb_ref.current;
        if (!body || !refs || !colliders_ready) return;

        const unregisters: (() => void)[] = [];

        for (let index = 0; index < body.numColliders(); index++) {
            const body_collider = body.collider(index);
            body_collider.setActiveHooks(1); // ActiveHooks.FILTER_CONTACT_PAIRS

            unregisters.push(
                register_collider_collision_info(body.collider(index).handle, {
                    get_tags: () => {
                        const node = resolve_object_node(refs.root.current);
                        return (node?.userData?.tags as string[] | undefined) ?? [];
                    },
                    filter: rb.collision_filter || {},
                })
            );
        }

        return () => unregisters.forEach((unregister) => unregister());
    }, [refs, rb.collision_filter, colliders_ready]);

    const {emit_report} = useObjectBinding(physics.binding);

    useKinematicPosition(rb_ref, rb, kinematic_pos_tracking_ref || container_ref);
    useKinematicVelocity(rb_ref, rb);
    useWorldHinge(
        rb_ref,
        refs?.constrained,
        rb.type === "dynamic" && rb.constraint?.type === "hinge" ? rb.constraint : undefined
    ); // TODO: unified useContsraints hook that automatically handles all constraint types
    // usePhysicsReporting(rbRef, physics, monitors, id); // TODO: implement

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

            const other_object_id = resolve_object_node(payload.other.rigidBodyObject ?? null)?.userData?.object_id ?? null;

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
                position={body_transform?.position}
                quaternion={body_transform ? rotation_to_quaternion_array(body_transform.rotation) : undefined}
                colliders={auto_strategy}

                {...collision_group_props}
                {...get_body_props(rb)}

                onCollisionEnter={report_collision_enter}
                onCollisionExit={report_collision_exit}
            >
                {ColliderComponent && <ColliderComponent position={collider.offset} rotation={collider.rotation} />}
                {!decouple_visual && children}
            </RigidBody>
            {decouple_visual && children}
        </group>
    );
};

// TODO: differentiate not colliding in response the player (getting slapped basically) vs letting the player walk through something