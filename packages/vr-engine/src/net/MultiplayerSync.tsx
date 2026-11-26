// the client → host half of shared mode: a client's reports go up to the host, and the host learns
// about remote players. host → clients is CommandSync.
//
// a client forwards every report its engine speaks for. player-caused ones only fire on that
// player's engine; object-caused ones are spoken for by one engine (report_outbox ReportSubject);
// world monitors run only on the host.

import type { ReportEvent } from "@hyperlinkvr/vr-engine-schemas";
import { useCallback, useEffect, useRef } from "react";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { add_report_sink } from "../engine/report_outbox";
import { run_triggers } from "../engine/trigger_registry";
import { request_watch_modal } from "../player/watch_event_bus";
import { set_world_authority } from "./authority";
import { PLAYER_ACTION_CHANNEL, REPORT_CHANNEL, SEAT_CHANNEL, SPAWN_CHANNEL } from "./command_bus";
import { useNetSession } from "./NetSession";
import { clear_seats, host_handle_seat_request, host_release_player_seats, type SeatMessage, type SeatRequest, set_seat_occupant, set_seat_transport } from "./seat_occupancy";
import { fail_player_actions_for, type PlayerActionMessage, resolve_player_action, set_player_action_transport } from "./player_actions";
import { local_to_session } from "./session_clock";

export const MultiplayerSync = () => {
    const { room, peers, mode, ended } = useNetSession();
    const { emit_event, apply_remote_command, connected } = useWebSDKMessaging();

    // tell the player their session ended (the watch modal lets them stay or go browse)
    useEffect(() => {
        if (!ended) {
            return;
        }
        void request_watch_modal("session_ended_modal", { reason: ended }, "stay");
    }, [ended]);

    const is_host = !!room && room.self.id === room.host();
    const is_shared_client = mode === "shared" && !!room && !is_host;

    // world-level logic (world monitors) runs on the host only. a shared client hands
    // world authority up so it doesn't double-fire; the host runs them and replicates the results.
    useEffect(() => {
        set_world_authority(!is_shared_client);
        return () => set_world_authority(true);
    }, [is_shared_client]);

    // a client forwards the reports its player caused to the host (reports are already stamped
    // with the local player id by report_outbox).
    useEffect(() => {
        if (!is_shared_client || !room) {
            return;
        }
        return add_report_sink((reports) => {
            // convert each report's ts from local to session time so the host reads a consistent
            // timeline (its own reports are already session time, as its offset is 0)
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

    // remote players' arrival, raised on the host's page in this order, once each:
    // join (in the room), spawn (announced once their world has loaded and they have a placeable body),
    // enter (announced once their play overlay is gone), leave (dropped out of the room)

    const joined_ref = useRef<Set<string>>(new Set());
    const spawned_ref = useRef<Set<string>>(new Set());
    const entered_ref = useRef<Set<string>>(new Set());

    // a logged-in peer joins with its account uuid, which the node adopts as its peer id; a guest has no
    // username and a minted id
    const identity_of = useCallback((id: string) => {
        const username = room?.peers().find((peer) => peer.id === id)?.username ?? null;
        return { username, account_id: username ? id : null };
    }, [room]);

    const emit_player = useCallback((message: Parameters<typeof emit_event>[0]) => {
        try {
            emit_event(message);
        } catch (error) {
            console.warn(`Failed to emit ${message.type}`, error);
        }
    }, [emit_event]);

    const ensure_joined = useCallback((id: string) => {
        if (joined_ref.current.has(id)) return;
        joined_ref.current.add(id);
        emit_player({ type: "HVRSDK_PLAYER_JOINED", id, ...identity_of(id), remote: true });
    }, [emit_player, identity_of]);

    useEffect(() => {
        if (!is_host || !connected || !room) {
            joined_ref.current = new Set();
            spawned_ref.current = new Set();
            entered_ref.current = new Set();
            return;
        }

        const current = new Set(peers.filter((peer) => peer.id !== room.self.id).map((peer) => peer.id));
        for (const id of current) {
            ensure_joined(id);
        }
        for (const id of [...joined_ref.current]) {
            if (!current.has(id)) {
                joined_ref.current.delete(id);
                spawned_ref.current.delete(id);
                entered_ref.current.delete(id);
                emit_player({ type: "HVRSDK_PLAYER_LEFT", id });
            }
        }
    }, [peers, is_host, connected, room, ensure_joined, emit_player]);

    useEffect(() => {
        if (!is_host || !connected || !room) {
            return;
        }
        const off_message = room.on_message((message) => {
            if (message.channel !== SPAWN_CHANNEL) {
                return;
            }
            // an announcement can race the peer-left for a peer that's already gone
            if (!room.peers().some((peer) => peer.id === message.from)) {
                return;
            }
            // `event` absent: an older client, whose only announcement was spawn
            const { event = "spawn", mode } = JSON.parse(message.payload as string) as { event?: "spawn" | "enter"; mode?: "vr" | "flat" };
            const id = message.from;
            ensure_joined(id);

            if (event === "spawn" && !spawned_ref.current.has(id)) {
                spawned_ref.current.add(id);
                emit_player({ type: "HVRSDK_PLAYER_SPAWNED", id, ...identity_of(id), mode, remote: true });
            } else if (event === "enter" && spawned_ref.current.has(id) && !entered_ref.current.has(id)) {
                entered_ref.current.add(id);
                emit_player({ type: "HVRSDK_PLAYER_ENTERED", id, mode, remote: true });
            }
        });
        return () => off_message();
    }, [is_host, connected, room, ensure_joined, emit_player, identity_of]);

    // player-targeted actions. the host forwards ones aimed at a remote player to that player's
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

    // seats: clients claim/release through the host, the host settles it and tells everyone who's in each
    useEffect(() => {
        if (!room || mode !== "shared") {
            return;
        }

        set_seat_transport(is_host
            ? { broadcast: (seat_id, player) => {
                const message: SeatMessage = { type: "occupant", seat_id, player };
                room.send("others", SEAT_CHANNEL, JSON.stringify(message), "reliable");
            } }
            : { send_to_host: (request) => room.send("host", SEAT_CHANNEL, JSON.stringify(request), "reliable") });

        const off_message = room.on_message((message) => {
            if (message.channel !== SEAT_CHANNEL) {
                return;
            }
            if (is_host) {
                host_handle_seat_request(message.from, JSON.parse(message.payload as string) as SeatRequest);
            } else if (message.from === room.host()) {
                const update = JSON.parse(message.payload as string) as SeatMessage;
                set_seat_occupant(update.seat_id, update.player);
            }
        });

        const off_event = room.on_event((event) => {
            if (is_host && event.type === "peer-left") {
                host_release_player_seats(event.peer_id);
            }
        });

        return () => {
            off_message();
            off_event();
            set_seat_transport(null);
            clear_seats();
        };
    }, [room, mode, is_host]);

    return null;
};
