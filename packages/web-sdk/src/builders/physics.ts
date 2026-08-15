import {BaseBuilder} from "./base";
import {
    AxisLockInput, BodyConstraintInput, BodyConstraintSchema,
    Collider,
    ColliderSchema,
    CustomMeshApproximation, DynamicRigidBodyInput, FixedRigidBodyInput, KinematicPositionRigidBodyInput,
    KinematicVelocityRigidBodyInput,
    MeshApproximation,
    PhysicsSystem,
    PhysicsSystemInput,
    PhysicsSystemSchema,
    RigidBody,
    RigidBodyInput,
    RigidBodySchema,
    RigidBodyType, Rotation
} from "@hyperlinkvr/vr-engine-schemas";
import {asset_url} from "../assets";

export class PhysicsSystemBuilder extends BaseBuilder<PhysicsSystemInput> {
    constructor() {
        super({});
    }

    set_rigid_body(body: RigidBody) {
        this._internal.rigid_body = body;
        return this;
    }

    // when report_motion supported then add here

    report_collisions(report = true) {
        this._internal.report_collisions = report;
        return this;
    }

    build(): PhysicsSystem {
        return PhysicsSystemSchema.parse(this._internal);
    }
}

class RigidBodyBuilder<RB extends RigidBodyInput> extends BaseBuilder<RB> {
    constructor(type: RigidBodyType) {
        super({type} as RB);
    }

    set_collider(collider: Collider) {
        this._internal.collider = collider;
        return this;
    }

    set_restitution(restitution: number) {
        this._internal.restitution = restitution;
        return this;
    }

    set_restitution_combine_rule(rule: "average" | "min" | "max" | "multiply") {
        this._internal.restitution_combine_rule = rule;
        return this;
    }

    set_friction(friction: number) {
        this._internal.friction = friction;
        return this;
    }

    set_linear_damping(linear_damping: number) {
        this._internal.linear_damping = linear_damping;
        return this;
    }

    set_angular_damping(angular_damping: number) {
        this._internal.angular_damping = angular_damping;
        return this;
    }

    build(): RigidBody {
        return RigidBodySchema.parse(this._internal);
    }
}

export class DynamicRigidBodyBuilder extends RigidBodyBuilder<DynamicRigidBodyInput> {
    constructor() {
        super("dynamic");
    }

    set_mass(mass: number) {
        this._internal.mass = mass;
        return this;
    }

    set_velocity(velocity: [number, number, number]) {
        this._internal.velocity = velocity;
        return this;
    }

    set_angular_velocity(angular_velocity: [number, number, number]) {
        this._internal.angular_velocity = angular_velocity;
        return this;
    }

    set_gravity_scale(gravity_scale: number) {
        this._internal.gravity_scale = gravity_scale;
        return this;
    }

    set_ccd(ccd: boolean) {
        this._internal.ccd = ccd;
        return this;
    }

    lock_axis(type: "translation" | "rotation", axis: "x" | "y" | "z") {
        if (this._internal.constraint && this._internal.constraint.type !== "axis-locks") {
            throw new Error("Cannot add axis locks to a body that already has a joint constraint.");
        }

        const current = this._internal.constraint ?? {type: "axis-locks" as const};

        this._internal.constraint = {
            ...current,
            [type]: {
                ...current[type],
                [axis]: true
            }
        };

        return this;
    }

    set_constraint(constraint: BodyConstraintInput) {
        if (this._internal.constraint) {
            console.warn("Constraint replaced.");
        }

        this._internal.constraint = BodyConstraintSchema.parse(constraint);
        return this;
    }

    lock_x_translation() {
        this.lock_axis("translation", "x");
        return this;
    }

    lock_y_translation() {
        this.lock_axis("translation", "y");
        return this;
    }

    lock_z_translation() {
        this.lock_axis("translation", "z");
        return this;
    }

    lock_x_rotation() {
        this.lock_axis("rotation", "x");
        return this;
    }

    lock_y_rotation() {
        this.lock_axis("rotation", "y");
        return this;
    }

    lock_z_rotation() {
        this.lock_axis("rotation", "z");
        return this;
    }

    set_locked_translation_axes(locked_translation_axes: AxisLockInput) {
        this._internal.constraint = {
            type: "axis-locks",
            translation: locked_translation_axes,
            rotation: this._internal.constraint?.type === "axis-locks" ? this._internal.constraint.rotation : undefined
        };
        return this;
    }

    set_locked_rotation_axes(locked_rotation_axes: AxisLockInput) {
        this._internal.constraint = {
            type: "axis-locks",
            translation: this._internal.constraint?.type === "axis-locks" ? this._internal.constraint.translation : undefined,
            rotation: locked_rotation_axes
        };
        return this;
    }
}

export class KinematicPosRigidBodyBuilder extends RigidBodyBuilder<KinematicPositionRigidBodyInput> {
    constructor() {
        super("kinematic-pos");
    }
}

export class KinematicVelRigidBodyBuilder extends RigidBodyBuilder<KinematicVelocityRigidBodyInput> {
    constructor() {
        super("kinematic-vel");
    }

    set_velocity(velocity: [number, number, number]) {
        this._internal.velocity = velocity;
        return this;
    }

    set_angular_velocity(angular_velocity: [number, number, number]) {
        this._internal.angular_velocity = angular_velocity;
        return this;
    }
}

export class FixedRigidBodyBuilder extends RigidBodyBuilder<FixedRigidBodyInput> {
    constructor() {
        super("fixed");
    }
}

export class ColliderBuilder extends BaseBuilder<Collider> {
    constructor() {
        super({type: "auto"});
    }

    box(size: [number, number, number]) {
        this._internal = {type: "box", size};
        return this;
    }

    sphere(radius: number) {
        this._internal = {type: "sphere", radius};
        return this;
    }

    capsule(radius: number, height: number) {
        this._internal = {type: "capsule", radius, height};
        return this;
    }

    cylinder(radius: number, height: number) {
        this._internal = {type: "cylinder", radius, height};
        return this;
    }

    custom_mesh(mesh_url: string, approximation?: CustomMeshApproximation) {
        this._internal = {type: "custom-mesh", mesh: asset_url(mesh_url), approximation};
        return this;
    }

    auto(approximation?: MeshApproximation) {
        this._internal = {type: "auto", approximation};
        return this;
    }

    set_offset(offset: [number, number, number]) {
        this._internal.offset = offset;
        return this;
    }

    set_rotation(rotation: Rotation) {
        this._internal.rotation = rotation;
        return this;
    }

    build(): Collider {
        return ColliderSchema.parse(this._internal);
    }
}
