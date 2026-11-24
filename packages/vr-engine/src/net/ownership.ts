import type { PeerID } from "@hyperlinkvr/core";
import type { RefObject } from "react";
import type { Object3D } from "three";

import { set_remote_simulator } from "./authority";

// who simulates each dynamic body in a shared world (#22). the host owns every body by default; a
// grab hands it to the grabbing peer, who keeps it until it comes to rest (so a throw plays out on
// the thrower's own engine, with no mid-flight handoff to rewind). the host arbitrates claims and
// broadcasts the result, so every engine agrees who to follow.
//
// dynamic bodies take part, and so do held objects (#23): a grabbable that isn't a dynamic body (no
// body, or a kinematic one) is moved only by the hand holding it, so while held its holder owns it,
// streams its pose and speaks for its reports; it's handed back as soon as it's let go (nothing to
// settle). other fixed/kinematic objects are deterministic, so each engine runs and reports for its
// own copy (that's what keeps a client's button presses reportable).
//
// ownership is turned into the low-level authority fact (`set_remote_simulator`) that
// report_outbox and PhysicsSync read.

type OwnershipRequest = { type: "claim"; id: string } | { type: "release"; id: string };

let self_id: PeerID | null = null;
// the host, or null outside a shared room (then everything is simulated here)
let default_owner: PeerID | null = null;
let send_to_host: ((request: OwnershipRequest) => void) | null = null;

const dynamic_bodies = new Set<string>();
// every grabbable's moved node, by object id. one that isn't also a dynamic body is a held object
const grab_targets = new Map<string, RefObject<Object3D | null>>();
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
// a grabbable that isn't a dynamic body: owned by whoever holds it, the host otherwise
export const is_held_object = (id: string): boolean => grab_targets.has(id) && !dynamic_bodies.has(id);
// anything ownership applies to
export const is_networked_object = (id: string): boolean => dynamic_bodies.has(id) || grab_targets.has(id);
export const get_held_objects = (): string[] => [...grab_targets.keys()].filter((id) => !dynamic_bodies.has(id));
// the node a held object's grab moves (what its holder streams and everyone else drives)
export const get_grab_target = (id: string): Object3D | null => grab_targets.get(id)?.current ?? null;
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
    if (!is_networked_object(id)) {
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
    for (const id of [...dynamic_bodies, ...grab_targets.keys()]) {
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
        if (grab_targets.has(id)) {
            // still a held object (its grabbable outlives its body)
            apply(id);
            return;
        }
        overrides.delete(id);
        pinned.delete(id);
        set_remote_simulator(id, null);
    };
};

// Grabbable registers what it moves, so a grabbable that isn't a dynamic body can still be handed
// between peers as a held object
export const register_grab_target = (id: string, target: RefObject<Object3D | null>): (() => void) => {
    grab_targets.set(id, target);
    apply(id);
    return () => {
        if (grab_targets.get(id) !== target) {
            return;
        }
        grab_targets.delete(id);
        if (!dynamic_bodies.has(id)) {
            overrides.delete(id);
            pinned.delete(id);
            set_remote_simulator(id, null);
        }
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
    if (!is_networked_object(id) || !self_id || owns_body(id)) {
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
