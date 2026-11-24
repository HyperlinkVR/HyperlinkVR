import type { ReportEvent } from "@hyperlinkvr/vr-engine-schemas";

import { has_world_authority, is_simulated_locally } from "../net/authority";
import { get_local_player_id } from "../player/player_position_registry";
import { run_triggers } from "./trigger_registry";

// every report and trigger firing leaves the engine through here

type ReportSink = (reports: ReportEvent[]) => void;

const sinks = new Set<ReportSink>();

// returns a function to remove the sink
export const add_report_sink = (sink: ReportSink): (() => void) => {
    sinks.add(sink);
    return () => {
        sinks.delete(sink);
    };
};

export const has_report_sink = (): boolean => sinks.size > 0;

// only the simulating engine speaks for a source, otherwise it'd report once per peer
const speaks_for = (object_id: string): boolean =>
    object_id ? is_simulated_locally(object_id) : has_world_authority();

// what caused a report, when that's not the reporting object itself. a zone is a world object every
// engine has, so speaking for the zone would make every engine report the same enter/exit: instead
// the cause decides who speaks.
export type ReportSubject =
    // an object entered/hit it: the host speaks, even for a body another peer owns and simulates. the
    // host runs the zone against the owner's streamed path, so "ball entered hole" is derived by the
    // host rather than asserted by the owner (a cheater has to forge a plausible path, which host
    // plausibility checks can catch, not just send an event). cosmetic feedback stays instant on the
    // owner via .local() triggers
    | { kind: "object"; id: string }
    // the local player's own body did it: only this engine has that body, so it always speaks
    | { kind: "local_player" }
    // no particular cause: the host speaks
    | { kind: "world" };

export const speaks_for_subject = (subject: ReportSubject): boolean => {
    switch (subject.kind) {
        case "object":
        case "world":
            return has_world_authority();
        case "local_player":
            return true;
    }
};

// `speaks` overrides the per-report source check (see ReportSubject)
export const publish_reports = (reports: ReportEvent[], speaks?: boolean) => {
    if (sinks.size === 0 || reports.length === 0) {
        return;
    }

    // stamp each report with the local player's id, so the host's page can attribute who caused it
    // (a client forwards these, already tagged, to the host)
    const player = get_local_player_id();
    const own = reports
        .filter((report) => speaks ?? speaks_for(report.object_id))
        .map((report) => (player ? { ...report, player } : report));
    if (own.length === 0) {
        return;
    }

    for (const sink of sinks) {
        try {
            sink(own);
        } catch (error) {
            console.warn("Failed to publish reports", error);
        }
    }
};

export const fire_triggers = (source_id: string, object_id: string, payload: unknown, speaks?: boolean) => {
    // the authority runs every trigger; a non-authority still runs `local` (cosmetic) ones
    run_triggers(source_id, payload, speaks ?? speaks_for(object_id));
};
