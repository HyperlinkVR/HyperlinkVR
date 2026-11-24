import type { PeerID } from "@hyperlinkvr/core";
import type { WebSDKActionName } from "@hyperlinkvr/types";

// actions aimed at one player (#14). the host's page runs the world, but a remote player's origin,
// position and navigation live on *their* engine, so the host forwards these to the target peer and
// relays the reply back to its page. null / our own id means the local player: handled in place.
const PLAYER_TARGETED = new Set<WebSDKActionName>([
    "HVRSDK_PLAYER_GET_POSITION",
    "HVRSDK_PLAYER_TELEPORT_TO",
    "HVRSDK_PLAYER_SEND_TO_WORLD",
    "HVRSDK_PLAYER_ADD_MONITOR",
    "HVRSDK_PLAYER_REMOVE_MONITOR",
]);

export type PlayerActionMessage =
    | { type: "action"; rid: string; data: any }
    | { type: "reply"; rid: string; reply: any };

interface PlayerActionTransport {
    self_id: () => PeerID;
    has_peer: (id: PeerID) => boolean;
    send: (peer: PeerID, message: PlayerActionMessage) => void;
}

let transport: PlayerActionTransport | null = null;
const pending = new Map<string, { peer: PeerID; action: string; reply: (message: any) => void }>();

// set by MultiplayerSync on the host only; null elsewhere so everything is handled locally
export const set_player_action_transport = (t: PlayerActionTransport | null) => {
    transport = t;
};

// returns true if the action was forwarded (or refused) and must not be handled locally
export const forward_player_action = (data: any, reply: (message: any) => void): boolean => {
    if (!transport || !PLAYER_TARGETED.has(data.action)) {
        return false;
    }

    const target = data.target_id as PeerID | null | undefined;
    if (!target || target === transport.self_id()) {
        return false;
    }

    if (!transport.has_peer(target)) {
        reply({ for: data.action, error: `Player ${target} is not in this session` });
        return true;
    }

    const rid = crypto.randomUUID();
    pending.set(rid, { peer: target, action: data.action, reply });
    transport.send(target, { type: "action", rid, data });
    return true;
};

export const resolve_player_action = (from: PeerID, rid: string, reply: any) => {
    const entry = pending.get(rid);
    if (!entry || entry.peer !== from) {
        return;
    }
    pending.delete(rid);
    entry.reply(reply);
};

// the target left before replying: fail its outstanding actions so the page's promises settle
export const fail_player_actions_for = (peer: PeerID | null) => {
    for (const [rid, entry] of pending) {
        if (peer === null || entry.peer === peer) {
            pending.delete(rid);
            entry.reply({ for: entry.action, error: "Player left the session" });
        }
    }
};
