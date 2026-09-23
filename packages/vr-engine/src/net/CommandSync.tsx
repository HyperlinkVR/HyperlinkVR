import type { CreatedEngineObject, VFXStack, WorldEnvFull } from "@hyperlinkvr/vr-engine-schemas";
import { adopt_assets, CreatedHUDElementSchema, EngineObjectDispatchSchema, serialise_assets, VFXStackSchema } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect } from "react";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { sample_live_transform } from "../engine/object_modification";
import { get_object_refs } from "../engine/object_ref_registry";
import { useEngineObjectStore } from "../stores/EngineObjectStore";
import { type StoredHUDElement, useHUDStore } from "../stores/HUDStore";
import { useVFXStore } from "../stores/VFXStore";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";
import { WORLD_ENV_DEFAULT } from "../world/WorldEnvironmentContext";
import { apply_world_env, get_current_world_env } from "../world/world_env_registry";
import { COMMAND_CHANNEL, SNAPSHOT_CHANNEL, SNAPSHOT_REQUEST_CHANNEL, set_command_transport } from "./command_bus";
import { useNetSession } from "./NetSession";

// current world state handed to a late joiner (#13). objects/HUD/VFX/world-env are covered; the one
// gap left is timing-sensitive state (active tweens/animations), which needs clock sync (#9).
interface Snapshot {
    objects: CreatedEngineObject[];
    hud: StoredHUDElement[];
    vfx: VFXStack;
    world_env: WorldEnvFull;
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
                        // take the live position/rotation (physics-driven) but keep the stored scale:
                        // scale is never physics-driven, and for body-owned poses the sampled group
                        // is forced to identity scale, so sampling it would ship [1,1,1] and desync
                        // the mesh from its collider.
                        objects: Object.values(useEngineObjectStore.getState().objects).map((o) => {
                            const refs = get_object_refs(o.id)?.current;
                            const live = refs
                                ? { ...o, transform: { ...sample_live_transform(refs), scale: o.transform.scale } }
                                : o;
                            return serialise_assets(live);
                        }),
                        // un-adopt assets (AssetRefs → url strings) so they survive JSON; client re-adopts
                        hud: Object.values(useHUDStore.getState().elements).map((el) => serialise_assets(el)),
                        vfx: serialise_assets(useVFXStore.getState().stack),
                        world_env: get_current_world_env() ?? WORLD_ENV_DEFAULT,
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
                    // readopt: url strings → AssetRefs
                    const { id, ...dispatch } = object as CreatedEngineObject;
                    const adopted = adopt_assets(EngineObjectDispatchSchema, dispatch);
                    enqueue_object({ id, ...adopted } as CreatedEngineObject);
                }

                // HUD: adopt the CreatedHUDElement part per element, re-attaching engine-local
                // bookkeeping (sequence, overrides) the schema doesn't cover
                const hud: Record<string, StoredHUDElement> = {};
                let next_sequence = 0;
                for (const stored of snapshot.hud ?? []) {
                    const { sequence, overrides, ...created } = stored;
                    hud[stored.id] = { ...adopt_assets(CreatedHUDElementSchema, created), sequence, overrides } as StoredHUDElement;
                    next_sequence = Math.max(next_sequence, sequence + 1);
                }
                useHUDStore.getState().hydrate(hud, next_sequence);

                useVFXStore.getState().set_stack(adopt_assets(VFXStackSchema, snapshot.vfx ?? []));

                if (snapshot.world_env) {
                    apply_world_env(snapshot.world_env);
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
        useHUDStore.getState().reset(undefined);
        useVFXStore.getState().clear();
        useWorldLoadingStateStore.getState().reset_for_new_document();
        room.send("host", SNAPSHOT_REQUEST_CHANNEL, "", "reliable");
    }, [is_shared_client, room]);

    return null;
};
