import type { CreatedEngineObject } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { RendererComponentProps } from "../types";
import { create_object_refs, ObjectRefsProvider } from "../contexts/ObjectRefsContext";
import { register_object_refs } from "./object_ref_registry";
import { CustomObjectRenderer } from "./CustomObjectRenderer";
import { PrefabRenderer } from "./PrefabRenderer";
import {rotation_to_quaternion} from "../util/rotation";
import {Group} from "three";
import {ObjectReadyMarker} from "./object_ready_registry";
import {register_object_monitors} from "../monitors/object_monitor_registry";
import {register_triggers} from "./trigger_registry";
import {body_owns_pose_for} from "./object_modification";
import {register_animation_channels} from "../animation/channel_registry";

export const EngineObjectRenderer = ({ data }: { data: CreatedEngineObject }) => {
    const { type, ...obj_rest } = data.object;

    const RendererComponent = useMemo(
        () => (type === "prefab" ? PrefabRenderer : CustomObjectRenderer),
        [data.object.type]
    ) as React.ComponentType<RendererComponentProps<any>>;

    const user_data_ref = useRef(data.user_data);

    const refs = useRef(create_object_refs(data.id));

    // register refs with registry for retrieval by sdk
    useEffect(() => register_object_refs(refs.current), []);

    // register monitors
    useEffect(
        () => register_object_monitors(data.id, data.monitors),
        [data.id, data.monitors]
    );

    // register triggers
    useEffect(
        () => register_triggers(data.triggers),
        [data.triggers]
    );

    // register animation channels for transform
    useEffect(() => {
        const object_refs = refs.current;

        const write = (target: "position" | "quaternion" | "scale", value: number[]) => {
            // dynamic and fixed bodies own their own pose, so leave them to the solver
            // TODO: tell the sdk if they're trying to illegally animate a fixed or dynamic body, so they ensure they use kinematic pos instead. maybe could convert temporarily to kinematic pos but that should be explicit behaviour
            if (body_owns_pose_for(object_refs)) return;
            object_refs.root.current?.[target].fromArray(value);
        };

        return register_animation_channels(data.id, {
            "transform.position": {
                value_type: "vector3",
                set: (value) => write("position", value as number[])
            },
            "transform.rotation": {
                value_type: "quaternion",
                set: (value) => write("quaternion", value as number[])
            },
            "transform.scale": {
                value_type: "vector3",
                set: (value) => write("scale", value as number[])
            }
        });
    }, [data.id]);

    // a physics object's pose is owned by its rigid body so the outer group must stay at identity or the mesh double-transforms
    // a non-physics object's pose is owned by this group
    const has_physics = data.object.type === "custom" && !!data.object.physics;
    // TODO: what about prefabs? or do they not need considering here as they can fully own their pose. but this also affects ready marker now

    useLayoutEffect(() => {
        const group = refs.current.root.current as Group | null;
        if (!group) return;

        if (has_physics) {
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
    }, [has_physics, data.transform]);

    return (
        <ObjectRefsProvider value={refs.current}>
            <group
                ref={refs.current.root}
                position={data.transform.position}
                scale={data.transform.scale}
                userData={{object_id: data.id, ...data.user_data, tags: data.tags ?? []}}
            >
                <RendererComponent
                    root_ref={refs.current.root}
                    user_data_ref={user_data_ref}
                    id={data.id}
                    transform={data.transform}
                    {...obj_rest}
                />
                <ObjectReadyMarker object_id={data.id} has_physics={has_physics} />
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

const created_button = await new h.EngineObjectDispatchBuilder()
    .set_object(button)
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

const created_duck = await new h.EngineObjectDispatchBuilder()
    .set_object(duck)
    .set_position(0, 1, -2)
    .create();

console.log("Created duck object with ID:", created_duck.id);
 */