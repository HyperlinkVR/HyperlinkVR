import type { ReportEvent } from "@hyperlinkvr/vr-engine-schemas";

import { has_world_authority, is_simulated_locally } from "../net/authority";
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

export const publish_reports = (reports: ReportEvent[]) => {
    if (sinks.size === 0 || reports.length === 0) {
        return;
    }

    const own = reports.filter((report) => speaks_for(report.object_id));
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

export const fire_triggers = (source_id: string, object_id: string, payload: unknown) => {
    if (!speaks_for(object_id)) {
        return;
    }

    run_triggers(source_id, payload);
};
