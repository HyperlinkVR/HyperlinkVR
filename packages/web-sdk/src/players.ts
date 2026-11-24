import {send_via_rtc} from "./messenger";
import type {PlayerMonitor, ReportEvent} from "@hyperlinkvr/vr-engine-schemas";
import {subscribe_report} from "./event_bus";
import type {NamedWebSDKEvent} from "@hyperlinkvr/types";

interface RegisteredMonitor {
    id: string;
    monitor: PlayerMonitor;
    unsubscribe: () => void;
}

// several Player handles can exist for one player, so per-player state lives here, keyed by id, not on instances
const monitors_by_player = new Map<string, Map<string, RegisteredMonitor>>();

const monitors_for = (id: string): Map<string, RegisteredMonitor> => {
    let registered = monitors_by_player.get(id);
    if (!registered) {
        registered = new Map();
        monitors_by_player.set(id, registered);
    }
    return registered;
};

interface PlayerRecord {
    username: string | null;
    account_id: string | null;
}

// everyone currently in the world, and what their spawn told us about them, keyed by player id
const live_players = new Map<string, Player>();
const records = new Map<string, PlayerRecord>();

let local_player: Player | null = null;
const local_player_waiters: ((player: Player) => void)[] = [];

/**
 * A player in the world. Get one from {@link on_spawn}, {@link me} or {@link list}, or wrap an id
 * you were given (e.g. `e.player` on a report).
 *
 * Every player has an id for this session, guests included. Whether they have an account is a
 * separate question: see {@link Player.get_account_id} and {@link Player.is_guest}.
 */
export class Player {
    readonly #id: string;

    constructor(id: string) {
        if (typeof id !== "string" || id.length === 0) {
            throw new TypeError("A Player needs a player id. Use players.me() for the local player.");
        }
        this.#id = id;
    }

    /**
     * This player's id for the session: the peer id in a shared world (a logged-in player's is
     * their account uuid; a guest's is minted and only lasts the connection). Key session state
     * (scores, turns, owned objects) on this. Never null.
     */
    get_id(): string {
        return this.#id;
    }

    /** @deprecated use {@link Player.get_id} */
    get_stored_id(): string {
        return this.#id;
    }

    /**
     * The durable account uuid, or null for a guest. Key anything that must outlive the session
     * (leaderboards, saves) on this.
     */
    get_account_id(): string | null {
        return records.get(this.#id)?.account_id ?? null;
    }

    is_guest(): boolean {
        return this.get_account_id() === null;
    }

    is_local(): boolean {
        return local_player !== null && local_player.#id === this.#id;
    }

    /** The player's display handle (`name@host`), or null for a guest. */
    async get_username(): Promise<string | null> {
        return records.get(this.#id)?.username ?? null;
    }

    async get_position() {
        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_GET_POSITION",
            target_id: this.#id
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
            target_id: this.#id,
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
            target_id: this.#id,
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
        const registered = monitors_for(this.#id);

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
                target_id: this.#id,
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
        const registered = monitors_for(this.#id);
        const entry = registered.get(name);

        if (!entry) {
            throw new Error(`No monitor named "${name}" is registered on this player.`);
        }

        // drop the local subscription first, and drop the bookkeeping whatever the engine says, so a failed remove cannot lock the name forever
        entry.unsubscribe();
        registered.delete(name);

        const res = await send_via_rtc({
            action: "HVRSDK_PLAYER_REMOVE_MONITOR",
            target_id: this.#id,
            monitor_id: entry.id
        });

        if (!res || !res.success) {
            throw new Error(`Failed to remove player monitor "${name}".`);
        }
    }

    async remove_all_monitors(): Promise<void> {
        const registered = monitors_for(this.#id);
        for (const name of [...registered.keys()]) {
            await this.remove_monitor(name);
        }
    }

    get_monitor_names(): string[] {
        return [...monitors_for(this.#id).keys()];
    }
}

/** The local player, once they've spawned. */
export const me = (): Promise<Player> => {
    if (local_player) {
        return Promise.resolve(local_player);
    }
    return new Promise((resolve) => local_player_waiters.push(resolve));
};

/** @deprecated use {@link me} (or the player passed to {@link on_spawn}) */
export const get_current_player = (): Player => {
    if (!local_player) {
        throw new Error("The local player hasn't spawned yet. Use `await players.me()` or players.on_spawn.");
    }
    return local_player;
};

/** The account uuid of a player present in the world by their handle, or null (guest / not present). */
export const resolve_username_to_uuid = async (username: string): Promise<string | null> => {
    for (const record of records.values()) {
        if (record.username === username) {
            return record.account_id;
        }
    }
    return null;
};

export interface SpawnInfo {
    mode?: "vr" | "flat";
    // true for a remote player (shared worlds, on the host)
    remote?: boolean;
}

/** A player, or a player id. */
export type PlayerRef = Player | string;

/** @internal */
export const player_ref_id = (ref: PlayerRef): string => (typeof ref === "string" ? ref : ref.get_id());

type SpawnCallback = (player: Player, info: SpawnInfo) => void;
type LeaveCallback = (player: Player) => void;

const spawn_callbacks = new Set<SpawnCallback>();
const leave_callbacks = new Set<LeaveCallback>();


// fires when a player enters the world (the local player, or a remote one on the host)
export const on_spawn = (callback: SpawnCallback): (() => void) => {
    spawn_callbacks.add(callback);
    return () => {
        spawn_callbacks.delete(callback);
    };
};

// fires when a remote player leaves
export const on_leave = (callback: LeaveCallback): (() => void) => {
    leave_callbacks.add(callback);
    return () => {
        leave_callbacks.delete(callback);
    };
};

// everyone present right now (local + any remote players the host has learned about)
export const list = (): Player[] => [...live_players.values()];

/** @internal */
export const _dispatch_spawn = (event: NamedWebSDKEvent<"HVRSDK_PLAYER_SPAWNED">) => {
    const player = new Player(event.id);
    live_players.set(event.id, player);
    records.set(event.id, {username: event.username ?? null, account_id: event.account_id ?? null});
    if (!event.remote) {
        local_player = player;
        for (const resolve of local_player_waiters.splice(0)) {
            resolve(player);
        }
    }
    for (const callback of spawn_callbacks) {
        try {
            callback(player, {mode: event.mode, remote: event.remote});
        } catch (error) {
            console.error("Error in player spawn callback:", error);
        }
    }
};

/** @internal */
export const _dispatch_leave = (event: NamedWebSDKEvent<"HVRSDK_PLAYER_LEFT">) => {
    const player = live_players.get(event.id) ?? new Player(event.id);
    live_players.delete(event.id);
    for (const callback of leave_callbacks) {
        try {
            callback(player);
        } catch (error) {
            console.error("Error in player leave callback:", error);
        }
    }
    records.delete(event.id);
    monitors_by_player.delete(event.id);
};
