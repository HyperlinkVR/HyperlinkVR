import type { SendTarget } from "@hyperlinkvr/core";
import type { WebSDKActionMessage, WebSDKActionName } from "@hyperlinkvr/types";

export const COMMAND_CHANNEL = "cmd";
// client → host: reports its player caused (button presses, grabs, triggers), so the host's page
// runs the world logic for them (#14). tagged with the client's player id.
export const REPORT_CHANNEL = "reports";
export const SNAPSHOT_REQUEST_CHANNEL = "snapshot-req";
export const SNAPSHOT_CHANNEL = "snapshot";

export type Origin = "page" | "network";

interface CommandSpec {
    mint?: (message: WebSDKActionMessage) => void;
}

const COMMAND_SPECS: Partial<Record<WebSDKActionName, CommandSpec>> = {
    HVRSDK_CREATE_ENGINE_OBJECT: {
        mint: (m: any) => { m.id ??= crypto.randomUUID(); },
    },
    HVRSDK_MODIFY_ENGINE_OBJECT: {},
    HVRSDK_DESTROY_ENGINE_OBJECT: {},

    HVRSDK_CREATE_HUD_ELEMENT: {
        mint: (m: any) => { m.id ??= crypto.randomUUID(); },
    },
    HVRSDK_UPDATE_HUD_ELEMENT: {},
    HVRSDK_DESTROY_HUD_ELEMENT: {},
    HVRSDK_RESET_HUD: {},

    HVRSDK_SET_VFX: {},
    HVRSDK_VFX_COMMAND: {},

    // TODO will drift by one latency hop until session clock sync (#9)
    HVRSDK_CREATE_ANIMATION: {
        mint: (m: any) => { m.id ??= crypto.randomUUID(); },
    },
    HVRSDK_DESTROY_ANIMATION: {},
    HVRSDK_ANIMATION_COMMAND: {},

    // TODO physics/timing is a later pass (#9 / phase D)
    HVRSDK_SEEK_ENGINE_OBJECT: {},
    HVRSDK_STOP_SEEK_ENGINE_OBJECT: {},

    HVRSDK_UPDATE_WORLD_ENV: {},
    HVRSDK_RESET_WORLD_ENV: {},

    HVRSDK_INTERACTION_COMMAND: {},
    HVRSDK_PREFAB_COMMAND: {},

    // lifecycle: the host's "world is ready" replicates so clients present during load clear
    // their loading screen off the host's signal, not their own (dropped) page's. late joiners
    // get world_ready in the join snapshot instead (see #13 / SnapshotSync).
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
