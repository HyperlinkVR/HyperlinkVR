import {send_via_rtc} from "./messenger";
import type {ReportEvent, Trigger, WorldMonitor} from "@hyperlinkvr/vr-engine-schemas";
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
    // optional: omit it to drive the monitor purely through triggers (the monitor
    // still gets a binding, so a trigger can source it) rather than a js callback
    callback?: (event: ReportEvent) => void
): Promise<() => Promise<void>> => {
    if (registered.has(name)) {
        throw new Error(`A world monitor named "${name}" is already registered.`);
    }

    const id = crypto.randomUUID();

    // claim the name synchronously so two concurrent adds cannot both pass the check above, then fill in the real entry once the engine accepts
    const placeholder: RegisteredMonitor = {id, monitor, unsubscribe: () => {}};
    registered.set(name, placeholder);

    const unsubscribe = callback ? subscribe_report(id, callback) : () => {};
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
    monitors: {name: string; monitor: WorldMonitor; callback?: (event: ReportEvent) => void}[]
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

// triggers are dispatched independently of monitors: a trigger names its source
// monitor (new TriggerBuilder(monitorName)), which is resolved to that monitor's
// binding id here before it goes to the engine. the monitor must be added first.

interface RegisteredTrigger {
    id: string;
}

const registered_triggers = new Map<string, RegisteredTrigger>();

export const add_trigger = async (name: string, trigger: Trigger): Promise<() => Promise<void>> => {
    if (registered_triggers.has(name)) {
        throw new Error(`A world trigger named "${name}" is already registered.`);
    }

    const source_name = trigger.source.name;
    if (!source_name) {
        throw new Error(
            `World trigger "${name}" has no source. Build it with new TriggerBuilder(monitorName) naming the monitor it reacts to.`
        );
    }

    const monitor = registered.get(source_name);
    if (!monitor) {
        throw new Error(
            `World trigger "${name}" sources from monitor "${source_name}", which is not registered. Add the monitor before the trigger.`
        );
    }

    const id = crypto.randomUUID();
    // claim the name synchronously against concurrent adds
    registered_triggers.set(name, {id});

    let res;
    try {
        res = await send_via_rtc({
            action: "HVRSDK_WORLD_ADD_TRIGGER",
            trigger: {
                ...trigger,
                source: {name: source_name, id: monitor.id}
            },
            trigger_id: id
        });
    } catch (error) {
        registered_triggers.delete(name);
        throw error;
    }

    if (!res || !res.success) {
        registered_triggers.delete(name);
        throw new Error(`Failed to add world trigger "${name}".`);
    }

    return () => remove_trigger(name);
};

export const remove_trigger = async (name: string): Promise<void> => {
    const entry = registered_triggers.get(name);
    if (!entry) {
        throw new Error(`No world trigger named "${name}" is registered.`);
    }

    // drop bookkeeping first so a failed remove cannot lock the name forever
    registered_triggers.delete(name);

    const res = await send_via_rtc({
        action: "HVRSDK_WORLD_REMOVE_TRIGGER",
        trigger_id: entry.id
    });

    if (!res || !res.success) {
        throw new Error(`Failed to remove world trigger "${name}".`);
    }
};

export const remove_all_triggers = async (): Promise<void> => {
    for (const name of [...registered_triggers.keys()]) {
        await remove_trigger(name);
    }
};

export const get_trigger_names = (): string[] => [...registered_triggers.keys()];
