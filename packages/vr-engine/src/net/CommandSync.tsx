import type { CreatedEngineObject } from "@hyperlinkvr/vr-engine-schemas";
import { adopt_assets, EngineObjectDispatchSchema, serialise_assets } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect } from "react";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { useEngineObjectStore } from "../stores/EngineObjectStore";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";
import { COMMAND_CHANNEL, SNAPSHOT_CHANNEL, SNAPSHOT_REQUEST_CHANNEL, set_command_transport } from "./command_bus";
import { useNetSession } from "./NetSession";

interface Snapshot {
    objects: CreatedEngineObject[];
    world_ready: boolean;
}

export const CommandSync = () => {
    const { room, mode } = useNetSession();
    const { apply_remote_command } = useWebSDKMessaging();

    const is_shared_client = mode === "shared" && !!room && room.self.id !== room.host();

    useEffect(() => {
        if (!room) {
            set_command_transport(null);
            return;
        }

        const is_host = () => room.self.id === room.host();

        set_command_transport({
            is_host,
            send: (target, payload) => room.send(target, COMMAND_CHANNEL, payload, "reliable"),
        });

        const off_message = room.on_message((message) => {
            // a client asking the host for the current world snapshot
            if (message.channel === SNAPSHOT_REQUEST_CHANNEL) {
                if (is_host()) {
                    const snapshot: Snapshot = {
                        // un-adopt AssetRefs to url strings so they survive json
                        objects: Object.values(useEngineObjectStore.getState().objects).map((o) => serialise_assets(o)),
                        world_ready: useWorldLoadingStateStore.getState().world_ready,
                    };
                    room.send({ peer: message.from }, SNAPSHOT_CHANNEL, JSON.stringify(snapshot), "reliable");
                }
                return;
            }

            // everything else must come from the host
            if (message.from !== room.host()) {
                return;
            }

            if (message.channel === COMMAND_CHANNEL) {
                apply_remote_command(JSON.parse(message.payload as string));
            } else if (message.channel === SNAPSHOT_CHANNEL) {
                const snapshot = JSON.parse(message.payload as string) as Snapshot;
                const { enqueue_object } = useEngineObjectStore.getState();
                for (const object of snapshot.objects) {
                    // readopt
                    const { id, ...dispatch } = object as CreatedEngineObject;
                    const adopted = adopt_assets(EngineObjectDispatchSchema, dispatch);
                    enqueue_object({ id, ...adopted } as CreatedEngineObject);
                }
                if (snapshot.world_ready) {
                    useWorldLoadingStateStore.getState().set_world_ready(true);
                }
            }
        });

        return () => {
            off_message();
            set_command_transport(null);
        };
    }, [room, apply_remote_command]);

    // wipe anything we have and request a snapshot from the host when we join a shared world
    useEffect(() => {
        if (!is_shared_client || !room) {
            return;
        }
        useEngineObjectStore.getState().clear_all_objects();
        useWorldLoadingStateStore.getState().reset_for_new_document();
        room.send("host", SNAPSHOT_REQUEST_CHANNEL, "", "reliable");
    }, [is_shared_client, room]);

    return null;
};
