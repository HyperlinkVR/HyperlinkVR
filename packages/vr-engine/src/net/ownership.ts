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
const listeners = new Set<(id: string) => void>();

export const get_body_owner = (id: string): PeerID | null => overrides.get(id) ?? default_owner;

// simulated here: we own it, or there's no shared room at all
export const owns_body = (id: string): boolean => {
    const owner = get_body_owner(id);
    return !owner || owner === self_id;
};

// grabbable here unless another peer has claimed it (it's in their hand, or their throw is in flight)
export const can_claim_body = (id: string): boolean => {
    const override = overrides.get(id);
    return !override || override === self_id;
};

export const is_dynamic_body = (id: string): boolean => dynamic_bodies.has(id);
export const get_dynamic_bodies = (): ReadonlySet<string> => dynamic_bodies;
export const get_owner_overrides = (): [string, PeerID][] => [...overrides];

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
    for (const id of dynamic_bodies) {
        notify(id);
    }
};

export const set_ownership_sender = (sender: ((request: OwnershipRequest) => void) | null) => {
    send_to_host = sender;
};

// ObjectPhysics registers every dynamic body so it can take part
export const register_dynamic_body = (id: string): (() => void) => {
    dynamic_bodies.add(id);
    apply(id);
    return () => {
        dynamic_bodies.delete(id);
        overrides.delete(id);
        set_remote_simulator(id, null);
    };
};

// null hands the body back to the default owner (the host)
export const set_body_owner = (id: string, owner: PeerID | null) => {
    if (owner && owner !== default_owner) {
        overrides.set(id, owner);
    } else {
        overrides.delete(id);
    }
    notify(id);
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

// hand a claimed body back to the host once it's at rest
export const release_body = (id: string) => {
    send_to_host?.({ type: "release", id });
};
