import type { CreatedEngineObject } from "@hyperlinkvr/vr-engine-schemas";
import { RefObject, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";



import { register_animation_channels } from "../animation/channel_registry";
import { create_object_refs, ObjectRefsContextType, ObjectRefsProvider } from "../contexts/ObjectRefsContext";
import { register_object_monitors } from "../monitors/object_monitor_registry";
import type { RendererComponentProps } from "../types";
import { rotation_to_quaternion } from "../util/rotation";
import { recompute_object_tags } from "../util/tags";
import { body_owns_pose_for } from "./object_modification";
import { ObjectReadyMarker } from "./object_ready_registry";
import { register_object_refs } from "./object_ref_registry";
import { RENDERERS } from "./renderers";
import { register_triggers } from "./trigger_registry";


export const EngineObjectRenderer = ({
    data,
    parent,
    object_id_override,
    suspend = true
}: {
    data: CreatedEngineObject;
    parent?: RefObject<ObjectRefsContextType>;
    // collections pass the root object id to keep user data united TODO: do we want this? or should it be per object
    object_id_override?: string;
    suspend?: boolean;
}) => {
    const { type, ...obj_rest } = data.object;

    const RendererComponent = useMemo(
        () => RENDERERS[data.object.type],
        [data.object.type]
    ) as React.ComponentType<RendererComponentProps<any>>;

    const user_data_ref = useRef(data.user_data);

    const refs = useRef(create_object_refs(data.id, parent));

    // publish tags to user data (that live on object refs, not the render group itself)
    useLayoutEffect(() => {
        const user_data = refs.current.user_data;
        user_data.object_id = data.id;
        Object.assign(user_data, data.user_data);
        // override wins over both data.id and anything in data.user_data, so a collection
        // member resolves to the collection rather than its internal id
        if (object_id_override !== undefined) {
            user_data.object_id = object_id_override;
        }
        user_data.__base_tags = data.tags ?? [];
        recompute_object_tags(user_data);
    }, [data.id, data.user_data, data.tags, object_id_override]);

    // register refs with registry for retrieval by sdk
    useEffect(() => register_object_refs(refs), []);

    // register monitors
    useEffect(
        () => register_object_monitors(data.id, data.monitors),
        [data.id, data.monitors]
    );

    // register triggers
    useEffect(() => register_triggers(data.triggers), [data.triggers]);

    // register animation channels for transform.
    // layout effect (not passive) so channels are registered synchronously at commit, before any
    // frame runs — the object is marked ready from a useFrame, and a collection member's first frame
    // can otherwise beat the passive effect, leaving its channels missing when they're gathered.
    useLayoutEffect(() => {
        const object_refs = refs.current;

        const write = (
            target: "position" | "quaternion" | "scale",
            value: number[]
        ) => {
            // dynamic and fixed bodies own their own pose, so leave them to the solver
            // TODO: tell the sdk if they're trying to illegally animate a fixed or dynamic body, so they ensure they use kinematic pos instead. maybe could convert temporarily to kinematic pos but that should be explicit behaviour
            if (body_owns_pose_for(object_refs)) return;
            object_refs.root.current?.[target].fromArray(value);
        };

        // relative tracks read the base pose off the same group write() targets. body-owned poses
        // aren't group-driven (write no-ops), so their base reads back as identity — matching that
        // absolute animation is a no-op there too
        const read = (target: "position" | "quaternion" | "scale"): number[] =>
            object_refs.root.current?.[target].toArray() ?? [];

        return register_animation_channels(data.id, {
            "transform.position": {
                value_type: "vector3",
                set: (value) => write("position", value as number[]),
                get: () => read("position")
            },
            "transform.rotation": {
                value_type: "quaternion",
                set: (value) => write("quaternion", value as number[]),
                get: () => read("quaternion")
            },
            "transform.scale": {
                value_type: "vector3",
                set: (value) => write("scale", value as number[]),
                get: () => read("scale")
            }
        });
    }, [data.id]);

    // a body-owned pose (fixed/dynamic/kinematic-vel) lives on the rigid body, so the outer group must
    // stay at identity or the mesh double-transforms. a kinematic-pos or non-physics object is posed by
    // this group instead — matching body_owns_pose_for, which the animation channel writes rely on.
    const has_physics = data.object.type === "custom" && !!data.object.physics;
    const rb_type =
        data.object.type === "custom"
            ? data.object.physics?.rigid_body?.type
            : undefined;
    const body_owns_pose = has_physics && rb_type !== "kinematic-pos";
    // TODO: what about prefabs? or do they not need considering here as they can fully own their pose. but this also affects ready marker now

    useLayoutEffect(() => {
        const group = refs.current.root.current as Group | null;
        if (!group) return;

        if (body_owns_pose) {
            group.position.set(0, 0, 0);
            group.quaternion.identity();
            group.scale.set(1, 1, 1);
        } else {
            group.position.set(
                data.transform.position[0],
                data.transform.position[1],
                data.transform.position[2]
            );
            rotation_to_quaternion(data.transform.rotation, group.quaternion);
            group.scale.set(
                data.transform.scale[0],
                data.transform.scale[1],
                data.transform.scale[2]
            );
        }
    }, [body_owns_pose, data.transform]);

    const RendererComponentWrapper = useMemo(() => {
        if (suspend) {
            return (props: RendererComponentProps<any>) => (
                <Suspense fallback={null}>
                    <RendererComponent {...props} />
                </Suspense>
            );
        }
        return RendererComponent;
    }, [RendererComponent, suspend]);

    return (
        <ObjectRefsProvider value={refs.current}>
            <group
                ref={refs.current.root}
                position={data.transform.position}
                scale={data.transform.scale}
                userData={refs.current.user_data}
            >
                <RendererComponentWrapper
                    root_ref={refs.current.root}
                    user_data_ref={user_data_ref}
                    id={data.id}
                    transform={data.transform}
                    tags={data.tags}
                    {...obj_rest}
                />

                <ObjectReadyMarker
                    object_id={data.id}
                    has_physics={has_physics}
                />
            </group>
        </ObjectRefsProvider>
    );
};

/*
await hyperlinkvr.connect();
const h = hyperlinkvr.builders;

const button = new h.ButtonPrefabBuilder()
    .set_label("Press Me")
    .set_color(0xff0000)
    .build();

const created_button = await new h.EngineObjectDispatchBuilder(button)
    .set_position(1, 1, -2)
    .create();

console.log("Created button object with ID:", created_button.id);


const duck = new h.CustomObjectBuilder()
    .set_mesh("https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/refs/heads/main/2.0/Duck/glTF-Binary/Duck.glb")
    .set_physics(new h.PhysicsSystemBuilder()
        .set_rigid_body(new h.DynamicRigidBodyBuilder()
            .set_collider(new h.ColliderBuilder().box([0.1, 1, 0.1]).build())
            .set_mass(0.2)
            .build()
        )
        .build()
    )
    .add_interaction(new h.GrabbableInteractionBuilder()
        .reports_grabs() // now recieves events when object grabbed
        .build()
    )
    .build();

const created_duck = await new h.EngineObjectDispatchBuilder(duck)
    .set_position(0, 1, -2)
    .create();

console.log("Created duck object with ID:", created_duck.id);
 */