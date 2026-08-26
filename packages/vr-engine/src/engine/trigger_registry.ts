import type { Trigger, TriggerEventFilter } from "@hyperlinkvr/vr-engine-schemas";

type CommandHandler = (command: string, args?: any) => Promise<any> | null;

const command_handlers = new Map<string, CommandHandler>();

export const register_command_handler = (binding_id: string, handler: CommandHandler) => {
    command_handlers.set(binding_id, handler);
    return () => {
        if (command_handlers.get(binding_id) === handler) {
            command_handlers.delete(binding_id);
        }
    };
};

// invoke a registered command handler directly by binding id
export const run_command = (binding_id: string, command: string, args?: any) => {
    const handler = command_handlers.get(binding_id);
    if (!handler) {
        console.warn(`No command handler registered for binding "${binding_id}" (command "${command}").`);
        return null;
    }
    return handler(command, args);
};

const triggers_by_source = new Map<string, Trigger[]>();

export const register_triggers = (triggers: Trigger[] | undefined) => {
    if (!triggers?.length) return () => {};

    const registered: Array<[string, Trigger[]]> = [];
    for (const trigger of triggers) {
        const source_id = trigger.source.id;
        if (!source_id) continue;

        const existing = triggers_by_source.get(source_id) ?? [];
        const next = [...existing, trigger];
        triggers_by_source.set(source_id, next);
        registered.push([source_id, next]);
    }

    return () => {
        for (const [source_id, list] of registered) {
            const current = triggers_by_source.get(source_id);
            if (!current) continue;
            const remaining = current.filter((candidate) => !list.includes(candidate));
            if (remaining.length) {
                triggers_by_source.set(source_id, remaining);
            } else {
                triggers_by_source.delete(source_id);
            }
        }
    };
};

// last fire per trigger, keyed by identity so a re-registered list resets
const last_fired = new WeakMap<Trigger, number>();

const matches_filter = (payload: any, filter: TriggerEventFilter | undefined): boolean => {
    if (!filter) return true;

    for (const [key, expected] of Object.entries(filter)) {
        const actual = payload?.[key];

        // an array value means "any of", which is the only non-equality the filter supports
        // TODO: more complex filtering support
        const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
        if (!ok) return false;
    }

    return true;
};

export const run_triggers = (source_id: string, payload: any) => {
    const triggers = triggers_by_source.get(source_id);
    if (!triggers) return;

    const now = performance.now();

    for (const trigger of triggers) {
        if (trigger.source.id !== source_id) continue;
        if (!matches_filter(payload, trigger.event_filter)) continue;

        if (trigger.cooldown_ms && trigger.cooldown_ms > 0) {
            const previous = last_fired.get(trigger);
            if (previous !== undefined && now - previous < trigger.cooldown_ms) continue;
        }
        last_fired.set(trigger, now);

        for (const target of trigger.targets) {
            const target_id = target.target.id;
            const handler = target_id ? command_handlers.get(target_id) : undefined;

            if (!handler) {
                console.warn(
                    `Trigger on ${source_id} targets "${target.target.name ?? target_id}", which has no command handler.`
                );
                continue;
            }

            let args = target.arguments;
            if (target.arguments_from_event) {
                args = {...args};
                for (const [key, event_key] of Object.entries(target.arguments_from_event)) {
                    args[key] = payload?.[event_key];
                }
            }

            try {
                handler(target.command, args);
            } catch (error) {
                console.error(`Trigger target "${target.command}" threw:`, error);
            }
        }
    }
};
