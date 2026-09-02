import {send_via_rtc} from "./messenger";
import {whoami} from "./auth";
import type {PlayerMonitor, ReportEvent} from "@hyperlinkvr/vr-engine-schemas";
import {subscribe_report} from "./event_bus";
import type {NamedWebSDKEvent} from "@hyperlinkvr/types";

interface RegisteredMonitor {
    id: string;
    monitor: PlayerMonitor;
    unsubscribe: () => void;
}

// get_current_player() creeates a fresh Player every call, so anything stored on an instance is lost the moment a second one is made
// TODO: is it better to bookkeep player classes as a whole? probably
const monitors_by_target = new Map<string, Map<string, RegisteredMonitor>>();

const LOCAL_TARGET_KEY = "@local";

const target_key = (username: string | null) => username ?? LOCAL_TARGET_KEY;

const monitors_for = (username: string | null): Map<string, RegisteredMonitor> => {
    const key = target_key(username);
    let registered = monitors_by_target.get(key);
    if (!registered) {
        registered = new Map();
        monitors_by_target.set(key, registered);
    }
    return registered;
};

export class Player {
    readonly #selected_username: string | null = null;

    // null targets the local player (currently the only one, but thinking ahead to multiplayer)
    constructor(username: string | null = null) {
        if (username !== null) {
            throw new Error("Selecting other players is not supported yet");
        }
        this.#selected_username = username;
    }

    get_stored_username(): string | null {
        return this.#selected_username;
    }

    async get_username(): Promise<string  | null> {
        if (this.#selected_username !== null) {
            // a null here means local player was passed, not necessarily that the player isn't logged in
            return this.#selected_username;
        }

        const res = await whoami();
        if (!res) {
            throw new Error("Failed to get player identity");
        }

        if (res.info === null) {
            // guest mode
            return null;
        }

        const {identity} = res.info;
        return `${identity.name}@${identity.host}`;
    }

    async get_position() {
        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_GET_POSITION",
            target_username: this.#selected_username
        });

        if (!res || res.position === undefined || res.yaw === undefined) {
            throw new Error("Failed to get player position");
        }

        return {
            position: res.position,
            yaw: res.yaw,
        }
    }

    async teleport_to(position?: [number, number, number], yaw?: number) {
        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_TELEPORT_TO",
            target_username: this.#selected_username,
            position,
            yaw
        });

        if (!res) {
            throw new Error("Failed to teleport player");
        }

        return {
            new_position: res.new_position,
            new_yaw: res.new_yaw,
        }
    }

    async send_to_world(url: string, prompt: "show" | "try_skip" | "skip_or_fail" = "show") {
        // validate url
        try {
            new URL(url);
        } catch (e) {
            throw new Error(`Invalid URL: ${url}`);
        }

        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_SEND_TO_WORLD",
            target_username: this.#selected_username,
            url,
            prompt
        });

        if (!res) {
            throw new Error("Failed to send player to world");
        }

        return res.going;
    }

    async add_monitor(
        name: string,
        monitor: PlayerMonitor,
        // optional: omit it to drive the monitor purely through triggers (the monitor
        // still gets a binding, so a trigger can source it) rather than a js callback
        callback?: (event: ReportEvent) => void
    ): Promise<() => Promise<void>> {
        const registered = monitors_for(this.#selected_username);

        if (registered.has(name)) {
            throw new Error(`A monitor named "${name}" is already registered on this player.`);
        }

        const id = crypto.randomUUID();

        // claim the name synchronously so two concurrent adds cannot both pass the check above, then fill in the real entry once the engine accepts
        const placeholder: RegisteredMonitor = {id, monitor, unsubscribe: () => {}};
        registered.set(name, placeholder);

        const unsubscribe = callback ? subscribe_report(id, callback) : () => {};
        placeholder.unsubscribe = unsubscribe;

        let res;
        try {
            res = await send_via_rtc({
                action: "HVRSDK_PLAYER_ADD_MONITOR",
                target_username: this.#selected_username,
                monitor: {
                    ...monitor,
                    binding: {name, id}
                }
            });
        } catch (error) {
            unsubscribe();
            registered.delete(name);
            throw error;
        }

        if (!res || !res.success) {
            unsubscribe();
            registered.delete(name);
            throw new Error(`Failed to add player monitor "${name}".`);
        }

        return () => this.remove_monitor(name);
    }

    async add_monitors(
        monitors: {name: string, monitor: PlayerMonitor, callback?: (event: ReportEvent) => void}[]
    ): Promise<() => Promise<void>> {
        const added: string[] = [];

        try {
            for (const {name, monitor, callback} of monitors) {
                await this.add_monitor(name, monitor, callback);
                added.push(name);
            }
        } catch (error) {
            // roll back so a partial failure does not leave half the batch live
            for (const name of added) {
                await this.remove_monitor(name).catch(() => {});
            }
            throw error;
        }

        return async () => {
            for (const {name} of monitors) {
                await this.remove_monitor(name);
            }
        };
    }

    async remove_monitor(name: string): Promise<void> {
        const registered = monitors_for(this.#selected_username);
        const entry = registered.get(name);

        if (!entry) {
            throw new Error(`No monitor named "${name}" is registered on this player.`);
        }

        // drop the local subscription first, and drop the bookkeeping whatever the engine says, so a failed remove cannot lock the name forever
        entry.unsubscribe();
        registered.delete(name);

        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_REMOVE_MONITOR",
            target_username: this.#selected_username,
            monitor_id: entry.id
        });

        if (!res || !res.success) {
            throw new Error(`Failed to remove player monitor "${name}".`);
        }
    }

    async remove_all_monitors(): Promise<void> {
        const registered = monitors_for(this.#selected_username);
        for (const name of [...registered.keys()]) {
            await this.remove_monitor(name);
        }
    }

    get_monitor_names(): string[] {
        return [...monitors_for(this.#selected_username).keys()];
    }
}

export const get_current_player = () => {
    return new Player();
}

export interface SpawnInfo {
    mode: "vr" | "flat";
}

type SpawnCallback = (player: Player, info: SpawnInfo) => void;

const spawn_callbacks = new Set<SpawnCallback>();

// fires when a player enters the world (rig + colliders live)
export const on_spawn = (callback: SpawnCallback): (() => void) => {
    spawn_callbacks.add(callback);
    return () => {
        spawn_callbacks.delete(callback);
    };
};

/** @internal */
export const _dispatch_spawn = (event: NamedWebSDKEvent<"HVRSDK_PLAYER_SPAWNED">) => {
    const player = new Player(event.username);
    for (const callback of spawn_callbacks) {
        try {
            callback(player, {mode: event.mode});
        } catch (error) {
            console.error("Error in player spawn callback:", error);
        }
    }
};
