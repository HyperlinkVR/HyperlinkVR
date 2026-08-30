import { CreatedEngineObject, ObjectCollection } from "@hyperlinkvr/vr-engine-schemas";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group, Matrix4, Quaternion, Vector3 } from "three";



import type { RendererComponentProps } from "../types";
import { EngineObjectRenderer } from "./EngineObjectRenderer";
import { sample_live_transform } from "./object_modification";
import { useObjectReady } from "./object_ready_registry";
import { get_object_refs } from "./object_ref_registry";


export const ObjectCollectionRenderer = (props: RendererComponentProps<ObjectCollection>) => {
    const renderable_parent = useMemo(() => {
        return {
            object: props.parent.object,
            transform: props.parent.transform ?? {position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]},
            user_data: props.user_data_ref.current ?? {},
            id: `${props.id}-parent`
            // TODO: triggers, monitors etc
        } satisfies CreatedEngineObject;
    }, [props.parent]);

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

    const renderable_children = useMemo(() => {
        return props.children.map((child) => {
            return {
                object: child.object,
                transform: child.transform ?? {position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]},
                user_data: props.user_data_ref.current ?? {},
                id: `${props.id}-child-${crypto.randomUUID()}`
            } satisfies CreatedEngineObject;
        });
    }, [props.children]);

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

    return (
        <>
            <EngineObjectRenderer data={renderable_parent} />
            <group ref={child_group_ref}>
                {parent_refs && renderable_children.map((child) => (
                    <EngineObjectRenderer key={child.id} data={child} parent={parent_refs} />
                ))}
            </group>
        </>
    )
}
