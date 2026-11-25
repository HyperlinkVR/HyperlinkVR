import type { CreatedEngineObject, SeekConfig, Transform, TweenEasing, VFXStack, WorldEnvFull } from "@hyperlinkvr/vr-engine-schemas";
import { adopt_assets, CreatedHUDElementSchema, EngineObjectDispatchSchema, serialise_assets, VFXStackSchema } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import { is_animation_binding } from "../animation/AnimationSync";
import type { AnimationPlaybackState } from "../animation/playback";
import { clear_animations, get_animation_snapshot, restore_animation_state } from "../animation/playback";
import { clear_active_seeks, get_active_seeks, set_active_seek } from "../animation/seek_registry";
import { clear_active_tweens, get_active_tweens, set_active_tween } from "../animation/tween_registry";
import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { sample_live_transform } from "../engine/object_modification";
import { wait_for_all_objects_ready } from "../engine/object_ready_registry";
import { get_object_refs } from "../engine/object_ref_registry";
import { run_command, set_trigger_replicator } from "../engine/trigger_registry";
import { useEngineObjectStore } from "../stores/EngineObjectStore";
import { type StoredHUDElement, useHUDStore } from "../stores/HUDStore";
import { useVFXStore } from "../stores/VFXStore";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";
import { WORLD_ENV_DEFAULT } from "../world/WorldEnvironmentContext";
import { apply_world_env, get_current_world_env } from "../world/world_env_registry";
import { COMMAND_CHANNEL, SNAPSHOT_CHANNEL, SNAPSHOT_REQUEST_CHANNEL, set_command_transport } from "./command_bus";
import { useNetSession } from "./NetSession";
import { get_grab_target, get_held_objects } from "./ownership";
import { set_world_pose } from "./PhysicsSync";
import { local_to_session, session_now, session_to_local } from "./session_clock";
import type { JournalEntry } from "./state_journal";
import { clear_journal, get_journal, journal_binding } from "./state_journal";

// a shared trigger's command, run by the host and replicated to clients on the command channel
interface BindingCommand {
    binding_command: { binding_id: string; command: string; args: any };
}

// current world state handed to a late joiner (#13). times are session times, so a tween or
// animation picks up at exactly the phase the host has it at
interface Snapshot {
    objects: CreatedEngineObject[];
    hud: StoredHUDElement[];
    vfx: VFXStack;
    world_env: WorldEnvFull;
    world_ready: boolean;
    // SDK-created animations: their definition and where playback is
    animations: { id: string; animation: unknown; state: AnimationPlaybackState }[];
    // transform tweens still running
    tweens: { id: string; from: Transform; to: Transform; easing: TweenEasing; duration_ms: number; start: number }[];
    // seeks still running
    seeks: (SeekConfig & { id: string })[];
    // state set by interaction/prefab commands since creation (state_journal)
    journal: JournalEntry[];
    // held objects without a body sit where their grab node was left, not at their root (#23)
    held: [string, number, number, number, number, number, number, number][];
}

// a shared client's view of the command stream around its join snapshot:
// - awaiting: commands so far are already reflected in the snapshot that's coming, so they're dropped
// - hydrating: the snapshot is loading; later commands are buffered, then applied in order on top
// - live: applied as they arrive
type Phase = "awaiting" | "hydrating" | "live";

const build_snapshot = (): Snapshot => {
    const tweens: Snapshot["tweens"] = [];
    for (const tween of get_active_tweens().values()) {
        tweens.push({
            id: tween.id,
            from: tween.from,
            to: tween.to,
            easing: tween.easing,
            duration_ms: tween.duration_ms,
            start: local_to_session(tween.start_ms)
        });
    }

    const seeks: Snapshot["seeks"] = [];
    for (const seek of get_active_seeks().values()) {
        // engine-local bookkeeping (velocity estimate, arrive callback) stays behind
        const { est_vel: _est_vel, last_target: _last_target, on_arrive: _on_arrive, ...config } = seek;
        seeks.push(config);
    }

    const held: Snapshot["held"] = [];
    const position = new Vector3();
    const quaternion = new Quaternion();
    for (const id of get_held_objects()) {
        const target = get_grab_target(id);
        if (!target) continue;
        target.getWorldPosition(position);
        target.getWorldQuaternion(quaternion);
        held.push([id, position.x, position.y, position.z, quaternion.x, quaternion.y, quaternion.z, quaternion.w]);
    }

    return {
        // take the live position/rotation (physics-driven) but keep the stored scale: scale is never
        // physics-driven, and for body-owned poses the sampled group is forced to identity scale, so
        // sampling it would ship [1,1,1] and desync the mesh from its collider.
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
        animations: get_animation_snapshot().map((entry) => ({
            ...entry,
            state: { ...entry.state, epoch: local_to_session(entry.state.epoch) }
        })),
        tweens,
        seeks,
        journal: get_journal(),
        held
    };
};

export const CommandSync = () => {
    const { room, mode } = useNetSession();
    const { apply_remote_command } = useWebSDKMessaging();

    const is_shared_client = mode === "shared" && !!room && room.self.id !== room.host();

    const phase = useRef<Phase>("live");
    const buffered = useRef<unknown[]>([]);

    useEffect(() => {
        if (!room) {
            set_command_transport(null);
            return;
        }

        const is_host = () => room.self.id === room.host();
        let disposed = false;

        set_command_transport({
            is_host,
            send: (target, payload) => room.send(target, COMMAND_CHANNEL, payload, "reliable"),
        });

        // the host's shared triggers run here only, so replicate each command they run. stamped with
        // the session time it fired, so an animation it plays starts in step on every engine
        clear_journal();
        set_trigger_replicator((binding_id, command, args) => {
            if (!is_host()) return;
            // one stamp for both, so a joiner replaying it from the journal knows how long ago it fired
            const stamped = { ...args, fired_at: args?.fired_at ?? session_now() };
            journal_binding(binding_id, command, stamped, !is_animation_binding(binding_id));
            const message: BindingCommand = {
                binding_command: { binding_id, command, args: stamped }
            };
            room.send("others", COMMAND_CHANNEL, JSON.stringify(message), "reliable");
        });

        const apply = (payload: any) => {
            if (payload && typeof payload === "object" && "binding_command" in payload) {
                const { binding_id, command, args } = (payload as BindingCommand).binding_command;
                void run_command(binding_id, command, args);
            } else {
                apply_remote_command(payload);
            }
        };

        const hydrate = async (snapshot: Snapshot) => {
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

            // everything below targets mounted objects (a tween or seek on an unmounted one is dropped,
            // and commands need their handlers registered), so wait for them to load. this also means
            // the player doesn't spawn onto, or get teleported to, ground that isn't there yet
            await wait_for_all_objects_ready();
            if (disposed) return;

            for (const { id, animation, state } of snapshot.animations ?? []) {
                apply_remote_command({ action: "HVRSDK_CREATE_ANIMATION", id, animation });
                restore_animation_state(id, { ...state, epoch: session_to_local(state.epoch) });
            }

            const position = new Vector3();
            const quaternion = new Quaternion();
            for (const [id, px, py, pz, qx, qy, qz, qw] of snapshot.held ?? []) {
                const target = get_grab_target(id);
                if (target) {
                    set_world_pose(target, position.set(px, py, pz), quaternion.set(qx, qy, qz, qw));
                }
            }

            for (const tween of snapshot.tweens ?? []) {
                set_active_tween({
                    id: tween.id,
                    from: tween.from,
                    to: tween.to,
                    easing: tween.easing,
                    duration_ms: tween.duration_ms,
                    start_ms: session_to_local(tween.start),
                    on_complete: () => {
                        const current = useEngineObjectStore.getState().get_object(tween.id);
                        if (!current) return;
                        useEngineObjectStore.getState().add_object({ ...current, transform: tween.to });
                    }
                });
            }

            for (const seek of snapshot.seeks ?? []) {
                set_active_seek({ ...seek, est_vel: new Vector3() });
            }

            for (const entry of snapshot.journal ?? []) {
                if (entry.kind === "action") {
                    apply_remote_command(entry.message);
                } else {
                    void run_command(entry.binding_id, entry.command, entry.args);
                }
            }

            // then whatever the host did while we loaded, in order
            phase.current = "live";
            const pending = buffered.current;
            buffered.current = [];
            for (const payload of pending) {
                apply(payload);
            }

            if (snapshot.world_ready) {
                const loading = useWorldLoadingStateStore.getState();
                loading.set_world_ready(true);
                loading.set_synced_with_host(true);
            }
        };

        const off_message = room.on_message((message) => {
            // a client asking the host for the current world snapshot
            if (message.channel === SNAPSHOT_REQUEST_CHANNEL) {
                if (is_host()) {
                    room.send({ peer: message.from }, SNAPSHOT_CHANNEL, JSON.stringify(build_snapshot()), "reliable");
                }
                return;
            }

            // everything else must come from the host
            if (message.from !== room.host()) {
                return;
            }

            if (message.channel === COMMAND_CHANNEL) {
                const payload = JSON.parse(message.payload as string);
                if (phase.current === "awaiting") {
                    return;
                }
                if (phase.current === "hydrating") {
                    buffered.current.push(payload);
                    return;
                }
                apply(payload);
            } else if (message.channel === SNAPSHOT_CHANNEL) {
                phase.current = "hydrating";
                void hydrate(JSON.parse(message.payload as string) as Snapshot);
            }
        });

        return () => {
            disposed = true;
            off_message();
            set_command_transport(null);
            set_trigger_replicator(null);
            clear_journal();
        };
    }, [room, apply_remote_command]);

    // wipe anything we have and request a snapshot from the host when we join a shared world
    useEffect(() => {
        if (!is_shared_client || !room) {
            phase.current = "live";
            buffered.current = [];
            return;
        }
        phase.current = "awaiting";
        buffered.current = [];
        useEngineObjectStore.getState().clear_all_objects();
        useHUDStore.getState().reset(undefined);
        useVFXStore.getState().clear();
        // anything our page started while it briefly ran the world solo
        clear_active_tweens();
        clear_active_seeks();
        clear_animations();
        useWorldLoadingStateStore.getState().reset_for_new_document();
        room.send("host", SNAPSHOT_REQUEST_CHANNEL, "", "reliable");
    }, [is_shared_client, room]);

    return null;
};
