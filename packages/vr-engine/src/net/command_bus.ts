import type { SendTarget } from "@hyperlinkvr/core";
import type { WebSDKActionMessage, WebSDKActionName } from "@hyperlinkvr/types";

export const COMMAND_CHANNEL = "cmd";

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
    // TODO: HUD (create/update/destroy/reset), VFX, animation, seek, world env,
    // world monitors + triggers. each create-style one needs a mint like above.
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

    if (transport.is_host()) {
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

    // page-authored on a client: the client has no authority to mint or apply. hand it to
    // the host and wait for the echo. the id the page sees must come from that echo.
    // TODO: correlate the page's reply (it currently blocks on a minted id + channels).
    transport.send("host", JSON.stringify(message));
    return false;
};
