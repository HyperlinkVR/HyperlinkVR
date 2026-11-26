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
type PlayerCallback = (player: Player) => void;

const join_callbacks = new Set<PlayerCallback>();
const spawn_callbacks = new Set<SpawnCallback>();
const enter_callbacks = new Set<SpawnCallback>();
const leave_callbacks = new Set<PlayerCallback>();

// who has reached each stage, so a handler registered late (the local player can join before the
// world's script has subscribed) still hears about everyone already there
const joined = new Set<string>();
const spawned = new Map<string, SpawnInfo>();
const entered = new Map<string, SpawnInfo>();

// `catch_up` is taken now (who's already there) and run on the next microtask, so a player whose event
// arrives in between is heard once, through the event, not twice
const subscribe = <T>(set: Set<T>, callback: T, catch_up: () => () => void): (() => void) => {
    set.add(callback);
    queueMicrotask(catch_up());
    return () => {
        set.delete(callback);
    };
};

/**
 * A player arrived in the session: the earliest moment, before their world has loaded or they have a
 * body. Good for rosters, "X is joining", reserving a slot. Not for placing them (see {@link on_spawn}).
 */
export const on_join = (callback: PlayerCallback): (() => void) => subscribe(join_callbacks, callback, () => {
    const already = [...joined].map((id) => live_players.get(id)).filter((player): player is Player => !!player);
    return () => already.forEach((player) => callback(player));
});

/**
 * The player can see and play: they've spawned and nothing is in the way (they clicked play or put the
 * headset on). Arriving in another world mid-session counts straight away. Start countdowns, timers
 * and anything they mustn't miss here.
 */
export const on_enter = (callback: SpawnCallback): (() => void) => subscribe(enter_callbacks, callback, () => {
    const already = [...entered].flatMap(([id, info]) => live_players.has(id) ? [[live_players.get(id)!, info] as const] : []);
    return () => already.forEach(([player, info]) => callback(player, info));
});


/**
 * A player has a body in the world that can be placed: their world has loaded, even if they haven't
 * clicked play yet. Teleport them to the start and hand out their things here, so they're already in
 * place when they look. (Fires for the local player, and on the host for each remote player.)
 */
export const on_spawn = (callback: SpawnCallback): (() => void) => subscribe(spawn_callbacks, callback, () => {
    const already = [...spawned].flatMap(([id, info]) => live_players.has(id) ? [[live_players.get(id)!, info] as const] : []);
    return () => already.forEach(([player, info]) => callback(player, info));
});

/** A player left (whether or not they ever spawned or entered). */
export const on_leave = (callback: PlayerCallback): (() => void) => subscribe(leave_callbacks, callback, () => () => {});

// everyone in the session right now (joined, whether or not they've spawned yet)
export const list = (): Player[] => [...live_players.values()];

const remember = (id: string, username?: string | null, account_id?: string | null) => {
    let player = live_players.get(id);
    if (!player) {
        player = new Player(id);
        live_players.set(id, player);
    }
    const known = records.get(id);
    records.set(id, {
        username: username !== undefined ? username : known?.username ?? null,
        account_id: account_id !== undefined ? account_id : known?.account_id ?? null
    });
    return player;
};

const run = <A extends unknown[]>(callbacks: Set<(...args: A) => void>, label: string, ...args: A) => {
    for (const callback of callbacks) {
        try {
            callback(...args);
        } catch (error) {
            console.error(`Error in player ${label} callback:`, error);
        }
    }
};

/** @internal */
export const _dispatch_join = (event: NamedWebSDKEvent<"HVRSDK_PLAYER_JOINED">) => {
    if (joined.has(event.id)) return;
    joined.add(event.id);
    const player = remember(event.id, event.username, event.account_id);
    run(join_callbacks, "join", player);
};

/** @internal */
export const _dispatch_spawn = (event: NamedWebSDKEvent<"HVRSDK_PLAYER_SPAWNED">) => {
    const player = remember(event.id, event.username, event.account_id);
    if (!event.remote) {
        local_player = player;
        for (const resolve of local_player_waiters.splice(0)) {
            resolve(player);
        }
    }
    const info: SpawnInfo = {mode: event.mode, remote: event.remote};
    spawned.set(event.id, info);
    run(spawn_callbacks, "spawn", player, info);
};

/** @internal */
export const _dispatch_enter = (event: NamedWebSDKEvent<"HVRSDK_PLAYER_ENTERED">) => {
    const player = remember(event.id);
    const info: SpawnInfo = {mode: event.mode, remote: event.remote};
    entered.set(event.id, info);
    run(enter_callbacks, "enter", player, info);
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
    joined.delete(event.id);
    spawned.delete(event.id);
    entered.delete(event.id);
    monitors_by_player.delete(event.id);
};
