import { useEffect } from "react";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { useEngineObjectStore } from "../stores/EngineObjectStore";
import {
    EngineObjectDispatchSchema,
    EngineObjectModificationSchema,
    safe_parse_and_adopt
} from "@hyperlinkvr/vr-engine-schemas";
import {get_object_refs} from "./object_ref_registry";
import {apply_modification, sample_live_transform} from "./object_modification";
import {cancel_active_tween, set_active_tween} from "../animation/tween_registry";
import {cancel_active_seek} from "../animation/seek_registry";
import {clear_object_ready, wait_for_object_ready} from "./object_ready_registry";
import {list_animation_channels} from "../animation/channel_registry";
import {collection_child_id, collection_parent_id} from "./collection_ids";
import type {EngineObject, ObjectCollection} from "@hyperlinkvr/vr-engine-schemas";
import type {CollectionChannelManifest, CollectionMemberChannels} from "@hyperlinkvr/types";


// members render under ids derived from the collection id (see collection_ids). wait for each to
// become ready so its channels are registered, then gather them into a manifest the sdk can use to
// hand out per-member animation targets. recurses for members that are themselves collections.
const build_member_manifest = async (object: EngineObject, member_id: string): Promise<CollectionMemberChannels> => {
    await wait_for_object_ready(member_id);
    const node: CollectionMemberChannels = {id: member_id, channels: list_animation_channels(member_id)};
    if (object.type === "collection") {
        node.parent = await build_member_manifest(object.parent.object, collection_parent_id(member_id));
        node.children = await Promise.all(
            object.children.map((child, i) => build_member_manifest(child.object, collection_child_id(member_id, i)))
        );
    }
    return node;
};

const build_collection_manifest = async (collection: ObjectCollection, collection_id: string): Promise<CollectionChannelManifest> => ({
    parent: await build_member_manifest(collection.parent.object, collection_parent_id(collection_id)),
    children: await Promise.all(
        collection.children.map((child, i) => build_member_manifest(child.object, collection_child_id(collection_id, i)))
    )
});


export const EngineObjectSync = () => {
    const rtc = useWebSDKMessaging();

    useEffect(() => {
        const unlisten_create = rtc.on_action("HVRSDK_CREATE_ENGINE_OBJECT", (message, reply) => {
            const {enqueue_object} = useEngineObjectStore.getState();

            const {success, data} = safe_parse_and_adopt(EngineObjectDispatchSchema, message.object);
            if (!success) {
                console.error("Failed to parse engine object dispatch", data);
                reply({ for: "HVRSDK_CREATE_ENGINE_OBJECT", error: "Failed to parse engine object dispatch" });
                return;
            }

            const id = crypto.randomUUID();
            const created_object = { id, ...data };
            console.log("(+) Creating engine object", created_object);

            // queue rather than mount immediately
            enqueue_object(created_object);

            wait_for_object_ready(id).then(async () => {
                console.log("(*) Engine object ready", id);

                const member_channels = created_object.object.type === "collection"
                    ? await build_collection_manifest(created_object.object, id)
                    : undefined;

                reply({
                    for: "HVRSDK_CREATE_ENGINE_OBJECT",
                    object: created_object,
                    channels: list_animation_channels(id),
                    ...(member_channels ? {member_channels} : {})
                });
            });
        });

        const unlisten_destroy = rtc.on_action("HVRSDK_DESTROY_ENGINE_OBJECT", (message, reply) => {
            const {remove_object} = useEngineObjectStore.getState();

            console.log("(-) Destroyed engine object", message.object_id);
            remove_object(message.object_id);
            clear_object_ready(message.object_id);
            console.log("New object count: ", Object.keys(useEngineObjectStore.getState().objects).length)

            reply({
                for: "HVRSDK_DESTROY_ENGINE_OBJECT",
                object_id: message.object_id
            });
        });

        const unlisten_refresh = rtc.on_action("HVRSDK_REFRESH_ENGINE_OBJECT", (message, reply) => {
            const {get_object} = useEngineObjectStore.getState();

            const stored = get_object(message.object_id);
            if (!stored) {
                reply({ for: "HVRSDK_REFRESH_ENGINE_OBJECT", error: `No object found with id ${message.object_id}` });
                return;
            }

            const refs = get_object_refs(message.object_id)?.current;
            if (!refs) {
                reply({ for: "HVRSDK_REFRESH_ENGINE_OBJECT", error: `No refs found for object with id ${message.object_id}` });
                return;
            }

            const live = {
                ...stored,
                transform: sample_live_transform(refs)
            };

            reply({
                for: "HVRSDK_REFRESH_ENGINE_OBJECT",
                object: live
            });
        });

        const unlisten_modify = rtc.on_action("HVRSDK_MODIFY_ENGINE_OBJECT", (message, reply) => {
            const {get_object, add_object} = useEngineObjectStore.getState();

            const {success, data} = safe_parse_and_adopt(EngineObjectModificationSchema, message.changes);
            if (!success) {
                reply({ for: "HVRSDK_MODIFY_ENGINE_OBJECT", error: `Failed to parse engine object modification: ${data}` });
                return;
            }

            const stored = get_object(message.object_id);
            if (!stored) {
                reply({ for: "HVRSDK_MODIFY_ENGINE_OBJECT", error: `No object found with id ${message.object_id}` });
                return;
            }

            const refs = get_object_refs(message.object_id)?.current;
            if (!refs) {
                reply({ for: "HVRSDK_MODIFY_ENGINE_OBJECT", error: `No refs found for object with id ${message.object_id}` });
                return;
            }

            // starting any modify supersedes a running tween or seek on this object
            cancel_active_tween(message.object_id);
            cancel_active_seek(message.object_id);

            if (message.tween && data.transform) {
                const live = sample_live_transform(refs);
                const target = { ...live, ...data.transform };

                set_active_tween({
                    id: message.object_id,
                    from: live,
                    to: target,
                    easing: message.tween.easing,
                    duration_ms: message.tween.ms,
                    start_ms: performance.now(),
                    on_complete: () => {
                        const current = useEngineObjectStore.getState().get_object(message.object_id);
                        if (!current) return; // destroyed before completion
                        useEngineObjectStore.getState().add_object({ ...current, transform: target });
                    }
                });

                // user_data / monitors (if any) still apply instantly alongside the tween
                // although the builder typically wont allow this for consistency
                if (data.user_data !== undefined || data.monitors !== undefined) {
                    add_object(apply_modification(stored, { ...data, transform: undefined }, refs));
                }

                reply({ for: "HVRSDK_MODIFY_ENGINE_OBJECT", object_id: message.object_id, success: true });
                return;
            }

            // if no tween, apply the modification immediately
            const next = apply_modification(stored, data, refs);
            add_object(next);

            reply({
                for: "HVRSDK_MODIFY_ENGINE_OBJECT",
                object_id: message.object_id,
                success: true
            });
        });

        return () => {
            unlisten_create();
            unlisten_destroy();
            unlisten_refresh();
            unlisten_modify();
        };
    }, [rtc]);

    return null;
}
