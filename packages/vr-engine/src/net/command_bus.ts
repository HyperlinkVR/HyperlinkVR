import type { SendTarget } from "@hyperlinkvr/core";
import type { WebSDKActionMessage, WebSDKActionName } from "@hyperlinkvr/types";

import { get_local_player_id } from "../player/player_position_registry";
import { session_now } from "./session_clock";
import { forget_journal_object, journal_action } from "./state_journal";

export const COMMAND_CHANNEL = "cmd";
// client → host: reports its player caused (button presses, grabs, triggers), so the host's page
// runs the world logic for them. tagged with the client's player id.
export const REPORT_CHANNEL = "reports";
// clock sync ping/pong so a client can estimate its offset to host (session) time
export const CLOCK_CHANNEL = "clock";
// owner → everyone, unreliable: poses + velocities of moving dynamic bodies it simulates
export const PHYSICS_CHANNEL = "physics";
// reliable: body ownership: client claims/releases to the host, host's owner broadcasts
export const OWNERSHIP_CHANNEL = "ownership";
// a client tells the host its player has actually spawned (world hydrated), so the host page's
// players.on_spawn fires once the player can stand somewhere, not on room join
export const SPAWN_CHANNEL = "spawn";
// host → a client: a player-targeted action (teleport, position, ...) for that client's player, and
// the client's reply back
export const PLAYER_ACTION_CHANNEL = "player-action";
// seat occupancy: a client claims/releases a seat to the host, the host broadcasts who's in it
export const SEAT_CHANNEL = "seat";
export const SNAPSHOT_REQUEST_CHANNEL = "snapshot-req";
export const SNAPSHOT_CHANNEL = "snapshot";

export type Origin = "page" | "network";

interface CommandSpec {
    // fill in host-authored ids before replication (create-style actions)
    mint?: (message: WebSDKActionMessage) => void;
    // rewrite host-local values into shared ones before replication: session timestamps for timed
    // actions, and "null = local player" into the host's own player id
    stamp?: (message: WebSDKActionMessage) => void;
}

const COMMAND_SPECS: Partial<Record<WebSDKActionName, CommandSpec>> = {
    HVRSDK_CREATE_ENGINE_OBJECT: {
        mint: (m: any) => {
            m.id ??= crypto.randomUUID();
            m.created_at ??= session_now();
        },
    },
    // stamp a tween's start in session time so its phase lines up across peers
    HVRSDK_MODIFY_ENGINE_OBJECT: {
        stamp: (m: any) => {
            if (m.tween) {
                m.tween_started_at ??= session_now();
            }
        },
    },
    HVRSDK_DESTROY_ENGINE_OBJECT: {},

    // the sdk uses null for "the local player". on the host that means the host, so resolve it to
    // the host's id before replicating, otherwise a null scope/target means "whoever reads it"
    HVRSDK_CREATE_HUD_ELEMENT: {
        mint: (m: any) => { m.id ??= crypto.randomUUID(); },
        stamp: (m: any) => {
            const scope = m.element?.scope;
            if (scope && scope !== "global" && Array.isArray(scope.ids)) {
                scope.ids = scope.ids.map((id: string | null) => id ?? get_local_player_id());
            }
        },
    },
    HVRSDK_UPDATE_HUD_ELEMENT: {
        stamp: (m: any) => { if (m.target_id === null) m.target_id = get_local_player_id(); },
    },
    HVRSDK_DESTROY_HUD_ELEMENT: {},
    HVRSDK_RESET_HUD: {
        stamp: (m: any) => { if (m.target_id === null) m.target_id = get_local_player_id(); },
    },

    HVRSDK_SET_VFX: {},
    HVRSDK_VFX_COMMAND: {},

    HVRSDK_CREATE_ANIMATION: {
        mint: (m: any) => { m.id ??= crypto.randomUUID(); },
    },
    HVRSDK_DESTROY_ANIMATION: {},
    // stamp the start in session time so play/restart line up across peers
    HVRSDK_ANIMATION_COMMAND: {
        stamp: (m: any) => {
            if (m.command === "play" || m.command === "restart") {
                m.args = { ...m.args, fired_at: m.args?.fired_at ?? session_now() };
            }
            // seats: the sdk's "the local player" means the host here, so name it before replicating
            if ((m.command === "sit" || m.command === "stand") && m.args && m.args.player_id == null) {
                m.args = { ...m.args, player_id: get_local_player_id() };
            }
        },
    },

    HVRSDK_SEEK_ENGINE_OBJECT: {},
    HVRSDK_STOP_SEEK_ENGINE_OBJECT: {},

    HVRSDK_UPDATE_WORLD_ENV: {},
    HVRSDK_RESET_WORLD_ENV: {},

    // stamp playback starts in session time, so a sound/effect starts at the same point everywhere and
    // a late joiner replaying it (state_journal) can tell how far in it should be (timed_playback)
    HVRSDK_INTERACTION_COMMAND: {
        stamp: (m: any) => {
            if (m.command === "play" || m.command === "restart") {
                m.args = { ...m.args, fired_at: m.args?.fired_at ?? session_now() };
            }
        },
    },
    HVRSDK_PREFAB_COMMAND: {},

    // lifecycle: the host's "world is ready" replicates so clients present during load clear
    // their loading screen off the host's signal, not their own (dropped) page's. late joiners
    // get world_ready in the join snapshot instead (see CommandSync).
    HVRSDK_LOADING_FINISHED: {},
};

export const is_command = (action: WebSDKActionName): boolean => action in COMMAND_SPECS;

// null when solo / not yet joined
interface CommandTransport {
    is_host: () => boolean;
    send: (target: SendTarget, payload: string) => void;
}

let transport: CommandTransport | null = null;

export const set_command_transport = (t: CommandTransport | null) => {
    transport = t;
};


export const route_command = (message: WebSDKActionMessage, origin: Origin): boolean => {
    const action = message.action as WebSDKActionName;

    // queries and singleplayer: nothing to replicate, just apply
    if (!is_command(action) || !transport) {
        return true;
    }

    const host = transport.is_host();

    if (host) {
        // host authority
        if (origin === "page") {
            COMMAND_SPECS[action]?.mint?.(message);
            COMMAND_SPECS[action]?.stamp?.(message);
        }

        // remember state-setting interaction/prefab commands for late joiners (state_journal)
        if (action === "HVRSDK_INTERACTION_COMMAND" || action === "HVRSDK_PREFAB_COMMAND") {
            journal_action(message as any);
        } else if (action === "HVRSDK_DESTROY_ENGINE_OBJECT") {
            forget_journal_object((message as any).object_id);
        }

        // TODO: stamp a monotonic seq here so late-join snapshots have a boundary and host migration can resume. reliable+ordered per (sender,channel) covers plain order

        // rebroadcast to all clients
        transport.send("others", JSON.stringify(message));
        return true;
    }

    // client in a shared world
    if (origin === "network") {
        // the host authored/echoed this so apply it verbatim
        return true;
    }

    // dont forward things the client request
    // TODO: maybe a way to have client computed things but with signing/permission from the host to prevent cheating, or double backed. not sure how the simulation transfer logic will work
    return false;
};
