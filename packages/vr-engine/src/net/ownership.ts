import type { PeerID } from "@hyperlinkvr/core";

import { set_remote_simulator } from "./authority";

// who simulates each dynamic body in a shared world (#22). the host owns every body by default; a
// grab hands it to the grabbing peer, who keeps it until it comes to rest (so a throw plays out on
// the thrower's own engine, with no mid-flight handoff to rewind). the host arbitrates claims and
// broadcasts the result, so every engine agrees who to follow.
//
// only dynamic bodies take part: fixed/kinematic objects are deterministic, so each engine runs and
// reports for its own copy (that's what keeps a client's button presses reportable).
//
// ownership is turned into the low-level authority fact (`set_remote_simulator`) that
// report_outbox and PhysicsSync read.

type OwnershipRequest = { type: "claim"; id: string } | { type: "release"; id: string };

let self_id: PeerID | null = null;
// the host, or null outside a shared room (then everything is simulated here)
let default_owner: PeerID | null = null;
let send_to_host: ((request: OwnershipRequest) => void) | null = null;

const dynamic_bodies = new Set<string>();
const overrides = new Map<string, PeerID>();
// pinned overrides (#24) stay with their owner: no hand-back at rest, and nobody else can claim them
const pinned = new Set<string>();
const listeners = new Set<(id: string) => void>();
// host only: replicates an ownership change to everyone (set by PhysicsSync)
let broadcast: ((id: string, owner: PeerID | null, pinned: boolean) => void) | null = null;

export const get_body_owner = (id: string): PeerID | null => overrides.get(id) ?? default_owner;

// simulated here: we own it, or there's no shared room at all
export const owns_body = (id: string): boolean => {
    const owner = get_body_owner(id);
    return !owner || owner === self_id;
};

// grabbable here unless another peer has it: claimed (in their hand, or their throw is in flight),
// or pinned to them (#24 — including pinned to the host)
export const can_claim_body = (id: string): boolean => {
    if (pinned.has(id)) {
        const owner = get_body_owner(id);
        return !owner || owner === self_id;
    }
    const override = overrides.get(id);
    return !override || override === self_id;
};

export const is_dynamic_body = (id: string): boolean => dynamic_bodies.has(id);
export const is_body_pinned = (id: string): boolean => pinned.has(id);
export const get_dynamic_bodies = (): ReadonlySet<string> => dynamic_bodies;
export const get_owner_overrides = (): [string, PeerID][] => [...overrides];

// everything that differs from "host owns it, unpinned" — claims, and pins (including pins to the
// host, which have no override). what a newcomer needs to be told
export const get_ownership_table = (): [string, PeerID | null, boolean][] => {
    const ids = new Set([...overrides.keys(), ...pinned]);
    return [...ids].map((id) => [id, get_body_owner(id), pinned.has(id)]);
};

const apply = (id: string) => {
    if (!dynamic_bodies.has(id)) {
        set_remote_simulator(id, null);
        return;
    }
    const owner = get_body_owner(id);
    set_remote_simulator(id, owner && owner !== self_id ? owner : null);
};

const notify = (id: string) => {
    apply(id);
    for (const listener of listeners) {
        listener(id);
    }
};

export const on_body_owner_change = (listener: (id: string) => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

// null/null leaves the shared world: everything goes back to being simulated here
export const configure_ownership = (self: PeerID | null, host: PeerID | null) => {
    self_id = self;
    default_owner = host;
    overrides.clear();
    pinned.clear();
    for (const id of dynamic_bodies) {
        notify(id);
    }
};

export const set_ownership_sender = (sender: ((request: OwnershipRequest) => void) | null) => {
    send_to_host = sender;
};

export const set_ownership_broadcaster = (fn: ((id: string, owner: PeerID | null, pinned: boolean) => void) | null) => {
    broadcast = fn;
};

// ObjectPhysics registers every dynamic body so it can take part
export const register_dynamic_body = (id: string): (() => void) => {
    dynamic_bodies.add(id);
    apply(id);
    return () => {
        dynamic_bodies.delete(id);
        overrides.delete(id);
        pinned.delete(id);
        set_remote_simulator(id, null);
    };
};

// null (or the host) hands the body to the default owner. pinning is independent of who owns it, so
// a body can be pinned to the host too
export const set_body_owner = (id: string, owner: PeerID | null, pin = false) => {
    if (owner && owner !== default_owner) {
        overrides.set(id, owner);
    } else {
        overrides.delete(id);
    }
    if (pin) {
        pinned.add(id);
    } else {
        pinned.delete(id);
    }
    notify(id);
};

// host only: change ownership and replicate it
export const assign_body_owner = (id: string, owner: PeerID | null, pin = false) => {
    set_body_owner(id, owner, pin);
    broadcast?.(id, owner, pin);
};

// a grab here takes the body optimistically (so the hand drives it this frame), and asks the host.
// if the host refuses, its owner broadcast takes it back and the grab is forced to let go
export const claim_body = (id: string) => {
    if (!dynamic_bodies.has(id) || !self_id || owns_body(id)) {
        return;
    }
    set_body_owner(id, self_id);
    send_to_host?.({ type: "claim", id });
};

// hand a claimed body back to the host once it's at rest (never a pinned one — it stays with its owner)
export const release_body = (id: string) => {
    if (pinned.has(id)) {
        return;
    }
    send_to_host?.({ type: "release", id });
};
