import {send_via_rtc} from "./messenger";
import type {ReportEvent, WorldMonitor} from "@hyperlinkvr/vr-engine-schemas";
import {subscribe_report} from "./event_bus";

interface RegisteredMonitor {
    id: string;
    monitor: WorldMonitor;
    unsubscribe: () => void;
}

const registered = new Map<string, RegisteredMonitor>();

export const add_monitor = async (
    name: string,
    monitor: WorldMonitor,
    callback: (event: ReportEvent) => void
): Promise<() => Promise<void>> => {
    if (registered.has(name)) {
        throw new Error(`A world monitor named "${name}" is already registered.`);
    }

    const id = crypto.randomUUID();

    // claim the name synchronously so two concurrent adds cannot both pass the check above, then fill in the real entry once the engine accepts
    const placeholder: RegisteredMonitor = {id, monitor, unsubscribe: () => {}};
    registered.set(name, placeholder);

    const unsubscribe = subscribe_report(id, callback);
    placeholder.unsubscribe = unsubscribe;

    let res;
    try {
        res = await send_via_rtc({
            action: "HVRSDK_WORLD_ADD_MONITOR",
            monitor: {
                ...monitor,
                binding: {name, id}
            }
        });
    } catch (error) {
        unsubscribe();
        registered.delete(name);
        throw error;
    }

    if (!res || !res.success) {
        unsubscribe();
        registered.delete(name);
        throw new Error(`Failed to add world monitor "${name}".`);
    }

    return () => remove_monitor(name);
};

export const add_monitors = async (
    monitors: {name: string; monitor: WorldMonitor; callback: (event: ReportEvent) => void}[]
): Promise<() => Promise<void>> => {
    const added: string[] = [];

    try {
        for (const {name, monitor, callback} of monitors) {
            await add_monitor(name, monitor, callback);
            added.push(name);
        }
    } catch (error) {
        // roll back so a partial failure does not leave half the batch live
        for (const name of added) {
            await remove_monitor(name).catch(() => {});
        }
        throw error;
    }

    return async () => {
        for (const {name} of monitors) {
            await remove_monitor(name);
        }
    };
};

export const remove_monitor = async (name: string): Promise<void> => {
    const entry = registered.get(name);
    if (!entry) {
        throw new Error(`No world monitor named "${name}" is registered.`);
    }

    // drop the local subscription and bookkeeping first, whatever the engine says, so a failed remove cannot lock the name forever
    entry.unsubscribe();
    registered.delete(name);

    const res = await send_via_rtc({
        action: "HVRSDK_WORLD_REMOVE_MONITOR",
        monitor_id: entry.id
    });

    if (!res || !res.success) {
        throw new Error(`Failed to remove world monitor "${name}".`);
    }
};

export const remove_all_monitors = async (): Promise<void> => {
    for (const name of [...registered.keys()]) {
        await remove_monitor(name);
    }
};

export const get_monitor_names = (): string[] => [...registered.keys()];
