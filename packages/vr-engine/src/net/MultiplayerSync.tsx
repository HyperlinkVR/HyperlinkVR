// the upstream half of shared mode: client player input flows *up* to the host, and the host
// learns about remote players (#14, #16). the downstream half — host state → clients — is CommandSync.
//
// scope note: a client forwards every report its engine produces. player-caused reports (button
// presses, grabs, trigger-enters, raycasts, input) are unambiguous — they only fire on the engine
// where that player is local, so they can't double-fire on the host. object-state reports (physics
// collisions, object monitors) still fire on both engines because both simulate locally, so those
// double-fire until per-object authority exists (#20). world monitors are already handled: a client
// hands world authority to the host below, so they run host-only.

import type { ReportEvent } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect, useRef } from "react";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { add_report_sink } from "../engine/report_outbox";
import { set_world_authority } from "./authority";
import { REPORT_CHANNEL } from "./command_bus";
import { useNetSession } from "./NetSession";
import { local_to_session } from "./session_clock";

export const MultiplayerSync = () => {
    const { room, peers, mode } = useNetSession();
    const { emit_event, connected } = useWebSDKMessaging();

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
            try {
                emit_event({ type: "HVRSDK_ENGINE_OBJECT_REPORT_BATCH", reports: tagged });
            } catch (error) {
                console.warn("Failed to forward client reports to page", error);
            }
        });
        return () => off_message();
    }, [room, is_host, emit_event]);

    // #16: tell the host's page which remote players are present, diffing joins/leaves so on_spawn
    // and on_leave each fire once. only the host runs the world, so only it needs these.
    const known_ref = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!is_host || !connected || !room) {
            known_ref.current = new Set();
            return;
        }

        const current = new Set(peers.filter((peer) => peer.id !== room.self.id).map((peer) => peer.id));

        for (const id of current) {
            if (!known_ref.current.has(id)) {
                try {
                    emit_event({ type: "HVRSDK_PLAYER_SPAWNED", id, remote: true });
                } catch (error) {
                    console.warn("Failed to emit remote player spawn", error);
                }
            }
        }
        for (const id of known_ref.current) {
            if (!current.has(id)) {
                try {
                    emit_event({ type: "HVRSDK_PLAYER_LEFT", id });
                } catch (error) {
                    console.warn("Failed to emit remote player leave", error);
                }
            }
        }

        known_ref.current = current;
    }, [peers, is_host, connected, room, emit_event]);

    return null;
};
