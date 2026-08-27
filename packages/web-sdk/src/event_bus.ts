import type { ReportEvent } from "@hyperlinkvr/vr-engine-schemas";

const report_subscriptions =  new Map<string, Set<(event: ReportEvent) => void>>();

export const subscribe_report = (id: string, callback: (event: ReportEvent) => void): (() => void) => {
    if (!report_subscriptions.has(id)) {
        report_subscriptions.set(id, new Set());
    }
    report_subscriptions.get(id)!.add(callback);

    return () => {
        const callbacks = report_subscriptions.get(id);
        if (!callbacks) {
            return;
        }

        callbacks.delete(callback);
        if (callbacks.size === 0) {
            report_subscriptions.delete(id);
        }
    };
};

export const publish_report = (event: ReportEvent): void => {
    const callbacks = report_subscriptions.get(event.source_id);
    if (!callbacks) return;
    for (const callback of [...callbacks]) {
        callback(event);
    }
};
