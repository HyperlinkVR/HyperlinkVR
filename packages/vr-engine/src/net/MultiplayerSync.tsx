// the upstream half of shared mode: client player input flows *up* to the host, and the host
// learns about remote players (#14, #16). the downstream half — host state → clients — is CommandSync.
//
// scope note: a client forwards every report its engine produces. player-caused reports (button
// presses, grabs, trigger-enters, raycasts, input) are unambiguous — they only fire on the engine
// where that player is local, so they can't double-fire on the host. object-caused reports (zones,
// collisions) are spoken for by one engine via their subject (report_outbox ReportSubject, #20), and
// world monitors run host-only because a client hands world authority to the host below.

import type { ReportEvent } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useRef } from "react";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { add_report_sink } from "../engine/report_outbox";
import { run_triggers } from "../engine/trigger_registry";
import { request_watch_modal } from "../player/watch_event_bus";
import { set_world_authority } from "./authority";
import { PLAYER_ACTION_CHANNEL, REPORT_CHANNEL, SPAWN_CHANNEL } from "./command_bus";
import { useNetSession } from "./NetSession";
import { fail_player_actions_for, type PlayerActionMessage, resolve_player_action, set_player_action_transport } from "./player_actions";
import { local_to_session } from "./session_clock";

export const MultiplayerSync = () => {
    const { room, peers, mode, ended } = useNetSession();
    const { emit_event, apply_remote_command, connected } = useWebSDKMessaging();

    // #17: tell the player their session ended (the watch modal lets them stay or go browse)
    useEffect(() => {
        if (!ended) {
            return;
        }
        void request_watch_modal("session_ended_modal", { reason: ended }, "stay");
    }, [ended]);

    const is_host = !!room && room.self.id === room.host();
    const is_shared_client = mode === "shared" && !!room && !is_host;

    // #10 (slice): world-level logic (world monitors) runs on the host only. a shared client hands
    // world authority up so it doesn't double-fire — the host runs them and replicates the results.
    useEffect(() => {
        set_world_authority(!is_shared_client);
        return () => set_world_authority(true);
    }, [is_shared_client]);

    // #14: a client forwards the reports its player caused to the host (reports are already stamped
    // with the local player id by report_outbox).
    useEffect(() => {
        if (!is_shared_client || !room) {
            return;
        }
        return add_report_sink((reports) => {
            // convert each report's ts from local to session time so the host reads a consistent
            // timeline (its own reports are already session time — host offset is 0)
            const in_session = reports.map((report) => ({ ...report, ts: local_to_session(report.ts) }));
            room.send("host", REPORT_CHANNEL, JSON.stringify(in_session), "reliable");
        });
    }, [is_shared_client, room]);

    // host: feed forwarded client reports to our page, so the world logic runs for them. `from` is
    // stamped server-side, so trust it as the player id over anything in the payload.
    useEffect(() => {
        if (!room || !is_host) {
            return;
        }
        const off_message = room.on_message((message) => {
            if (message.channel !== REPORT_CHANNEL) {
                return;
            }
            const reports = JSON.parse(message.payload as string) as ReportEvent[];
            const tagged = reports.map((report) => ({ ...report, player: message.from }));

            // the client's event runs the world's shared triggers here (the client ran only its local
            // ones), and their effects replicate to everyone
            for (const report of reports) {
                run_triggers(report.source_id, report.payload, true, true);
            }
            try {
                emit_event({ type: "HVRSDK_ENGINE_OBJECT_REPORT_BATCH", reports: tagged });
            } catch (error) {
                console.warn("Failed to forward client reports to page", error);
            }
        });
        return () => off_message();
    }, [room, is_host, emit_event]);

    // #16: tell the host's page about remote players. on_spawn fires when the client says its player
    // has actually spawned (its world is hydrated), not on room join, so the world can teleport them
    // and drop objects in front of them without them falling through ground that isn't loaded yet.
    // on_leave fires for spawned players that drop out of the peer list. only the host runs the world.
    const spawned_ref = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!is_host || !connected || !room) {
            spawned_ref.current = new Set();
            return;
        }
        const off_message = room.on_message((message) => {
            if (message.channel !== SPAWN_CHANNEL || spawned_ref.current.has(message.from)) {
                return;
            }
            // a spawn can race the peer-left for a peer that's already gone
            if (!room.peers().some((peer) => peer.id === message.from)) {
                return;
            }
            const { mode } = JSON.parse(message.payload as string) as { mode?: "vr" | "flat" };
            // a logged-in peer joins with its account uuid, which the node adopts as its peer id; a
            // guest has no username and a minted id
            const username = room.peers().find((peer) => peer.id === message.from)?.username ?? null;
            const account_id = username ? message.from : null;
            spawned_ref.current.add(message.from);
            try {
                emit_event({ type: "HVRSDK_PLAYER_SPAWNED", id: message.from, username, account_id, mode, remote: true });
            } catch (error) {
                console.warn("Failed to emit remote player spawn", error);
            }
        });
        return () => off_message();
    }, [is_host, connected, room, emit_event]);

    useEffect(() => {
        if (!is_host || !room) {
            return;
        }

        const current = new Set(peers.map((peer) => peer.id));
        for (const id of [...spawned_ref.current]) {
            if (!current.has(id)) {
                spawned_ref.current.delete(id);
                try {
                    emit_event({ type: "HVRSDK_PLAYER_LEFT", id });
                } catch (error) {
                    console.warn("Failed to emit remote player leave", error);
                }
            }
        }

    }, [peers, is_host, room, emit_event]);

    // #14: player-targeted actions. the host forwards ones aimed at a remote player to that player's
    // engine (see player_actions / WebSDKMessagingContext) and relays the reply to its page; a client
    // runs them against its own player and replies. only the host may send them.
    useEffect(() => {
        if (!room || mode !== "shared") {
            return;
        }

        if (is_host) {
            set_player_action_transport({
                self_id: () => room.self.id,
                has_peer: (id) => room.peers().some((peer) => peer.id === id),
                send: (peer, message) => room.send({ peer }, PLAYER_ACTION_CHANNEL, JSON.stringify(message), "reliable"),
            });
        }

        const off_message = room.on_message((message) => {
            if (message.channel !== PLAYER_ACTION_CHANNEL) {
                return;
            }
            const parsed = JSON.parse(message.payload as string) as PlayerActionMessage;
            if (parsed.type === "reply" && is_host) {
                resolve_player_action(message.from, parsed.rid, parsed.reply);
            } else if (parsed.type === "action" && !is_host && message.from === room.host()) {
                apply_remote_command(parsed.data, (reply) => {
                    const back: PlayerActionMessage = { type: "reply", rid: parsed.rid, reply };
                    room.send("host", PLAYER_ACTION_CHANNEL, JSON.stringify(back), "reliable");
                });
            }
        });

        const off_event = room.on_event((event) => {
            if (event.type === "peer-left") {
                fail_player_actions_for(event.peer_id);
            }
        });

        return () => {
            off_message();
            off_event();
            if (is_host) {
                set_player_action_transport(null);
                fail_player_actions_for(null);
            }
        };
    }, [room, mode, is_host, apply_remote_command]);

    return null;
};
