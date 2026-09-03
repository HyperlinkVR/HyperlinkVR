import { CreatedEngineObject, ObjectCollection } from "@hyperlinkvr/vr-engine-schemas";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group, Matrix4, Quaternion, Vector3 } from "three";



import { useObjectRefs } from "../contexts/ObjectRefsContext";
import type { RendererComponentProps } from "../types";
import { collection_child_id, collection_parent_id } from "./collection_ids";
import { EngineObjectRenderer } from "./EngineObjectRenderer";
import { sample_live_transform } from "./object_modification";
import { useObjectReady } from "./object_ready_registry";
import { get_object_refs } from "./object_ref_registry";


export const ObjectCollectionRenderer = (props: RendererComponentProps<ObjectCollection>) => {
    const renderable_parent = useMemo(() => {
        return {
            object: props.parent.object,
            transform: props.parent.transform ?? {position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]},
            // collection user_data is the base identity; member user_data overrides on top
            user_data: {...(props.user_data_ref.current ?? {}), ...(props.parent.user_data ?? {})},
            monitors: props.parent.monitors,
            triggers: props.parent.triggers,
            // collection tags apply to every member (so tag-filtered hits catch the whole thing), plus the member's own TODO: do we always want this or should it be config
            tags: [...(props.tags ?? []), ...(props.parent.tags ?? [])],
            id: collection_parent_id(props.id)
        } satisfies CreatedEngineObject;
    }, [props.parent, props.tags]);

    const parent_ready = useObjectReady(renderable_parent.id);
    const parent_refs = useMemo(() => {
        if (!parent_ready) {
            return null;
        }
        const refs = get_object_refs(renderable_parent.id);
        if (!refs) {
            console.error(`ObjectCollectionRenderer: parent refs not found for ${renderable_parent.id}`);
            return null;
        }
        return refs;
    }, [parent_ready, renderable_parent.id]);

    // need to grab object refs for the object root itself to allow binding monitors
    const collection_refs = useObjectRefs();
    useEffect(() => {
        if (!parent_refs || !parent_refs.current) {
            return;
        }

        // collection driven by parent
        const original = collection_refs.rigid_body;
        collection_refs.rigid_body = parent_refs.current.rigid_body;

        return () => {
            collection_refs.rigid_body = original;
        };
    }, [collection_refs, parent_refs]);

    const renderable_children = useMemo(() => {
        return props.children.map((child, index) => {
            return {
                object: child.object,
                transform: child.transform ?? {position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]},
                user_data: {...(props.user_data_ref.current ?? {}), ...(child.user_data ?? {})},
                monitors: child.monitors,
                triggers: child.triggers,
                tags: [...(props.tags ?? []), ...(child.tags ?? [])],
                id: collection_child_id(props.id, index)
            } satisfies CreatedEngineObject;
        });
    }, [props.children, props.tags]);

    const child_group_ref = useRef<Group>(null);

    // scratch for mapping the parent's world pose into child_group's local space
    const target_matrix = useMemo(() => new Matrix4(), []);
    const local_matrix = useMemo(() => new Matrix4(), []);
    const scratch_pos = useMemo(() => new Vector3(), []);
    const scratch_quat = useMemo(() => new Quaternion(), []);
    const scratch_scale = useMemo(() => new Vector3(), []);

    // child group ref should follow parent transform (offsets handled natively as transform within group)
    // priority -2 as must run before the children's kinematic-pos read (-1) so they track this frame's pose, not last frame's
    useFrame(() => {
        const group = child_group_ref.current;
        if (!group || !group.parent || !parent_refs || !parent_refs.current) {
            return;
        }

        if ((!parent_refs.current.rigid_body.current?.isValid() && !parent_refs.current.root.current) || !group.parent.matrixWorld) {
            // not yet ready to sample live transform
            return;
        }

        const live = sample_live_transform(parent_refs.current);

        // map world pose to child group local pose
        scratch_pos.set(live.position[0], live.position[1], live.position[2]);
        scratch_quat.set(live.rotation[0], live.rotation[1], live.rotation[2], live.rotation[3]!);
        scratch_scale.set(live.scale[0], live.scale[1], live.scale[2]);
        target_matrix.compose(scratch_pos, scratch_quat, scratch_scale);

        group.parent.updateWorldMatrix(true, false);
        local_matrix.copy(group.parent.matrixWorld).invert().multiply(target_matrix);
        local_matrix.decompose(group.position, group.quaternion, group.scale);
    }, -2);

    // suspense disabled so collection is suspended as a whole if any child is suspended, rather than each child individually
    return (
        <>
            <EngineObjectRenderer data={renderable_parent} object_id_override={props.id} suspend={false} />
            <group ref={child_group_ref}>
                {parent_refs && renderable_children.map((child) => (
                    <EngineObjectRenderer key={child.id} data={child} parent={parent_refs} object_id_override={props.id} suspend={false} />
                ))}
            </group>
        </>
    )
}
