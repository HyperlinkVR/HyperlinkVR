// host-side record of the state interaction/prefab commands have set, for late joiners (#13).
//
// those commands change state that lives inside the engine (a light's colour, a button's label, a golf
// ball's lock), not on the stored object the snapshot is built from, so a joiner would otherwise see
// every object as it was created. the host keeps the latest state-setting command per target and
// command, in the order they last happened, and a joiner replays them once its objects have mounted.
//
// only commands that *set* state are kept: `set_*`, plus lock/unlock (one slot, last wins). interaction
// playback (play/pause/stop/restart on a sound or particle emitter) is state too, in one "playback" slot:
// it carries the session time it fired, and the handler uses that to start a looping track at the right
// point and to skip a one-shot that already finished (timed_playback), so nothing old refires. other
// one-shots (fire, pulse…) aren't kept. prefab commands don't get the playback slot (a prefab's own
// play isn't time-aware), and nor do animations (their exact playback state is snapshotted instead).
// commands come from the host's page (routed through the command bus) and from its shared triggers.

export type JournalEntry =
    // an SDK action (HVRSDK_INTERACTION_COMMAND / HVRSDK_PREFAB_COMMAND), replayed through the dispatcher
    | { kind: "action"; object_id: string; message: unknown }
    // a trigger target, replayed by binding id
    | { kind: "binding"; binding_id: string; command: string; args: unknown };

const PAIRED: Record<string, string> = { lock: "lock", unlock: "lock" };
const PLAYBACK: Record<string, string> = { play: "playback", pause: "playback", stop: "playback", restart: "playback" };

const is_stateful = (command: string, playback: boolean) =>
    command.startsWith("set_") || command in PAIRED || (playback && command in PLAYBACK);
const slot = (command: string) => PAIRED[command] ?? PLAYBACK[command] ?? command;

// insertion order is recency: an update moves its entry to the end
const entries = new Map<string, JournalEntry>();

const put = (key: string, entry: JournalEntry) => {
    entries.delete(key);
    entries.set(key, entry);
};

export const journal_action = (message: { action: string; object_id: string; interaction_id?: string; command: string }) => {
    if (!is_stateful(message.command, message.action === "HVRSDK_INTERACTION_COMMAND")) {
        return;
    }
    const key = `a:${message.action}:${message.object_id}:${message.interaction_id ?? ""}:${slot(message.command)}`;
    put(key, { kind: "action", object_id: message.object_id, message });
};

// `playback`: false for bindings whose play isn't time-aware (animations)
export const journal_binding = (binding_id: string, command: string, args: unknown, playback = true) => {
    if (!is_stateful(command, playback)) {
        return;
    }
    put(`b:${binding_id}:${slot(command)}`, { kind: "binding", binding_id, command, args });
};

// an object was destroyed: its state goes with it
export const forget_journal_object = (object_id: string) => {
    for (const [key, entry] of entries) {
        if (entry.kind === "action" && entry.object_id === object_id) {
            entries.delete(key);
        }
    }
};

export const get_journal = (): JournalEntry[] => [...entries.values()];

export const clear_journal = () => {
    entries.clear();
};
