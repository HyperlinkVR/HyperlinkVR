// shared physics (#20/#21/#22). every dynamic body has one owner (ownership.ts): the host by default,
// or whoever grabbed it until it comes to rest. the owner simulates and streams it; every other engine
// flips it kinematic and follows the stream.
//
// built to survive an unreliable transport even though the websocket carrier is reliable today
// (WebTransport, #19, slots in underneath with no change here): every frame carries full absolute
// state stamped in session time, so a dropped or reordered frame only costs smoothness. only moving
// (or held) bodies are sent; when one falls asleep it's sent a few more times so a dropped final
// frame can't leave anyone holding a stale pose. ownership itself rides the reliable channel.

import type { PeerID } from "@hyperlinkvr/core";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Object3D } from "three";
import { Matrix4, Quaternion, Vector3 } from "three";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { get_object_refs } from "../engine/object_ref_registry";
import { is_object_held } from "../interaction/util/holders";
import { is_simulated_locally } from "./authority";
import { clear_body_buffers, forget_body, get_body_buffers, latest_body_velocity, push_body_sample, BODY_INTERP_DELAY_MS } from "./body_stream";
import { OWNERSHIP_CHANNEL, PHYSICS_CHANNEL } from "./command_bus";
import { useNetSession } from "./NetSession";
import {
    assign_body_owner,
    configure_ownership,
    get_body_owner,
    get_dynamic_bodies,
    get_grab_target,
    get_held_objects,
    get_owner_overrides,
    get_ownership_table,
    is_body_pinned,
    is_held_object,
    on_body_owner_change,
    owns_body,
    release_body,
    set_body_owner,
    set_ownership_broadcaster,
    set_ownership_sender
} from "./ownership";
import { session_now } from "./session_clock";

const SEND_INTERVAL_MS = 1000 / 30;
const REST_RESENDS = 3;

// drives a node to a world pose through its parent, for held objects with no body (#23)
const scratch_inverse = new Matrix4();
const scratch_parent_q = new Quaternion();
const set_world_pose = (node: Object3D, position: Vector3, quaternion: Quaternion) => {
    const parent = node.parent;
    if (!parent) {
        node.position.copy(position);
        node.quaternion.copy(quaternion);
        return;
    }
    parent.updateWorldMatrix(true, false);
    node.position.copy(position).applyMatrix4(scratch_inverse.copy(parent.matrixWorld).invert());
    parent.getWorldQuaternion(scratch_parent_q);
    node.quaternion.copy(scratch_parent_q.invert().multiply(quaternion));
};

// mirrors rapier's enum (as Grabbable does) to avoid importing rapier-compat here
enum RigidBodyType {
    Dynamic = 0,
    KinematicPositionBased = 2
}

// [id, px, py, pz, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz]
type BodyEntry = [string, number, number, number, number, number, number, number, number, number, number, number, number, number];

interface PhysicsFrame {
    t: number; // sender's session time the state was read
    b: BodyEntry[];
}

type OwnershipMessage =
    // client → host: my physics is live (PhysicsSync mounted), so I can simulate and receive ownership
    | { type: "ready" }
    | { type: "claim"; id: string }
    | { type: "release"; id: string }
    | { type: "owner"; id: string; owner: PeerID | null; pinned?: boolean }
    | { type: "table"; owners: [string, PeerID | null, boolean][] };

export const PhysicsSync = () => {
    const { room, mode } = useNetSession();
    const { on_action } = useWebSDKMessaging();
    const shared = mode === "shared" && !!room;
    const is_host = shared && room.self.id === room.host();

    // bodies this engine turned kinematic because someone else owns them, so it knows which to
    // hand back to dynamic when it takes ownership (and never touches a grab's own kinematic hold)
    const made_kinematic = useRef(new Set<string>());
    // first follow of a body snaps instead of interpolating from wherever it spawned
    const snapped = useRef(new Set<string>());
    const awake = useRef(new Set<string>());
    const rest_resends = useRef(new Map<string, number>());
    const releasing = useRef(new Set<string>());
    const since_send = useRef(0);

    // host: peers whose physics is live, and pins waiting on a peer that isn't yet. a pin to a player
    // whose scene hasn't started would leave the body simulated by nobody, so until they report ready
    // it stays pinned to the host (simulating, ungrabbable), then moves to them
    const ready_peers = useRef(new Set<PeerID>());
    const pending_pins = useRef(new Map<string, PeerID>());
    const scratch = useRef({ position: new Vector3(), quaternion: new Quaternion() });

    // ownership follows the room. v1 has no host migration (#17), so the host is fixed for its life
    useEffect(() => {
        if (!shared || !room) {
            configure_ownership(null, null);
            return;
        }
        configure_ownership(room.self.id, room.host());
        return () => configure_ownership(null, null);
    }, [shared, room]);

    // a body becoming ours drops any samples we'd buffered from its previous owner
    useEffect(() => on_body_owner_change((id) => {
        releasing.current.delete(id);
        if (owns_body(id)) {
            forget_body(id);
        }
    }), []);

    useEffect(() => {
        awake.current.clear();
        rest_resends.current.clear();
        releasing.current.clear();
        snapped.current.clear();
        ready_peers.current.clear();
        pending_pins.current.clear();
        since_send.current = 0;
    }, [room, is_host]);

    useEffect(() => {
        if (!shared || !room) {
            return;
        }

        const send = (target: Parameters<typeof room.send>[0], message: OwnershipMessage) =>
            room.send(target, OWNERSHIP_CHANNEL, JSON.stringify(message), "reliable");

        // a client's claims and releases go to the host; the host's decisions go to everyone
        set_ownership_sender(is_host ? null : (request) => send("host", request));
        set_ownership_broadcaster(is_host ? (id, owner, pinned) => send("others", { type: "owner", id, owner, pinned }) : null);

        const off_message = room.on_message((message) => {
            if (message.channel === PHYSICS_CHANNEL) {
                const frame = JSON.parse(message.payload as string) as PhysicsFrame;
                for (const [id, px, py, pz, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz] of frame.b) {
                    // only a body's current owner may drive it (`from` is stamped server-side), which
                    // also drops a previous owner's frames still in flight after a handoff
                    if (get_body_owner(id) !== message.from) {
                        continue;
                    }
                    push_body_sample(id, { t: frame.t, p: [px, py, pz], q: [qx, qy, qz, qw], v: [vx, vy, vz], w: [wx, wy, wz] });
                }
                return;
            }

            if (message.channel !== OWNERSHIP_CHANNEL) {
                return;
            }
            const request = JSON.parse(message.payload as string) as OwnershipMessage;

            if (is_host) {
                if (request.type === "ready") {
                    // their listener is attached now, so the table can't be lost to the join-time
                    // buffer drain. then hand over anything we'd pinned to them while they loaded
                    ready_peers.current.add(message.from);
                    send({ peer: message.from }, { type: "table", owners: get_ownership_table() });
                    for (const [id, owner] of [...pending_pins.current]) {
                        if (owner === message.from) {
                            pending_pins.current.delete(id);
                            assign_body_owner(id, owner, true);
                        }
                    }
                } else if (request.type === "claim") {
                    const current = get_body_owner(request.id);
                    // a pinned body only ever goes to its owner. otherwise it's taken if another peer
                    // has it, or it's in one of the host's own hands
                    const taken = is_body_pinned(request.id)
                        ? current !== message.from
                        : (current !== room.self.id && current !== message.from) || is_object_held(request.id);
                    if (taken) {
                        // correct the claimer; they'll let go
                        const owner = current === room.self.id ? null : current;
                        send({ peer: message.from }, { type: "owner", id: request.id, owner, pinned: is_body_pinned(request.id) });
                    } else {
                        assign_body_owner(request.id, message.from, is_body_pinned(request.id));
                    }
                } else if (request.type === "release" && get_body_owner(request.id) === message.from
                    && !is_body_pinned(request.id)) {
                    assign_body_owner(request.id, null);
                }
                return;
            }

            // a client takes the host's word on who owns what
            if (message.from !== room.host()) {
                return;
            }
            if (request.type === "owner") {
                set_body_owner(request.id, request.owner, request.pinned ?? false);
            } else if (request.type === "table") {
                for (const [id, owner, pinned] of request.owners) {
                    set_body_owner(id, owner, pinned);
                }
            }
        });

        // host: take back anything a leaver owned or was waiting on (newcomers are briefed on `ready`)
        const off_event = room.on_event((event) => {
            if (!is_host || event.type !== "peer-left") {
                return;
            }
            ready_peers.current.delete(event.peer_id);
            // pinned or not, a leaver's bodies come back to the host, unpinned
            for (const [id, owner] of get_owner_overrides()) {
                if (owner === event.peer_id) {
                    assign_body_owner(id, null);
                }
            }
            for (const [id, owner] of [...pending_pins.current]) {
                if (owner === event.peer_id) {
                    pending_pins.current.delete(id);
                    assign_body_owner(id, null);
                }
            }
        });

        // client: tell the host our physics is live — only once our listener above is attached
        if (!is_host) {
            send("host", { type: "ready" });
        }

        return () => {
            off_message();
            off_event();
            set_ownership_sender(null);
            set_ownership_broadcaster(null);
            clear_body_buffers();
        };
    }, [shared, room, is_host]);

    // #24: the sdk pins an object's physics to a player. ownership is host-authored like everything
    // else shared — a client's (inert) page asking is refused, and solo has nobody to pin to
    useEffect(() => on_action("HVRSDK_SET_OBJECT_OWNERSHIP", (message, reply) => {
        if (shared && !is_host) {
            reply({ for: "HVRSDK_SET_OBJECT_OWNERSHIP", error: "Only the host can set object ownership." });
            return;
        }
        if (shared && room) {
            const id = message.object_id;
            pending_pins.current.delete(id);

            if (!message.pin) {
                // unpin: back to the host, claimable by a grab
                assign_body_owner(id, null);
            } else {
                // null owner = the local player, which on the host page is the host
                const owner = message.owner ?? room.self.id;
                if (owner === room.self.id || ready_peers.current.has(owner)) {
                    assign_body_owner(id, owner, true);
                } else {
                    // their scene isn't live yet: hold it pinned to the host until they're ready
                    pending_pins.current.set(id, owner);
                    assign_body_owner(id, null, true);
                }
            }
        }
        reply({ for: "HVRSDK_SET_OBJECT_OWNERSHIP", object_id: message.object_id, success: true });
    }), [on_action, shared, is_host, room]);

    // runs before the physics step so kinematic targets land this frame
    useFrame((_, delta) => {
        // 1. body types follow ownership. runs even outside a shared room, so leaving one hands every
        // body back to dynamic
        for (const id of get_dynamic_bodies()) {
            const body = get_object_refs(id)?.current?.rigid_body.current;
            if (!body || !body.isValid()) {
                continue;
            }

            if (!is_simulated_locally(id)) {
                if (body.bodyType() !== RigidBodyType.KinematicPositionBased) {
                    body.setBodyType(RigidBodyType.KinematicPositionBased, true);
                }
                made_kinematic.current.add(id);
            } else if (made_kinematic.current.has(id)) {
                made_kinematic.current.delete(id);
                // a local grab already drives this body and owns its type; otherwise take it over
                if (!is_object_held(id)) {
                    body.setBodyType(RigidBodyType.Dynamic, true);
                    const velocity = latest_body_velocity(id);
                    if (velocity) {
                        body.setLinvel({ x: velocity.v[0], y: velocity.v[1], z: velocity.v[2] }, true);
                        body.setAngvel({ x: velocity.w[0], y: velocity.w[1], z: velocity.w[2] }, true);
                    }
                }
                forget_body(id);
            }
        }

        if (!shared || !room) {
            return;
        }

        // 2. stream what we own
        since_send.current += delta * 1000;
        if (since_send.current >= SEND_INTERVAL_MS) {
            since_send.current %= SEND_INTERVAL_MS;

            const entries: BodyEntry[] = [];
            for (const id of get_dynamic_bodies()) {
                if (!is_simulated_locally(id)) {
                    continue;
                }
                const body = get_object_refs(id)?.current?.rigid_body.current;
                if (!body || !body.isValid()) {
                    continue;
                }

                // a non-physical grab holds a dynamic body kinematic, so held counts as moving
                const held = is_object_held(id);
                let send = false;
                if (held || !body.isSleeping()) {
                    awake.current.add(id);
                    rest_resends.current.delete(id);
                    send = true;
                } else if (awake.current.has(id)) {
                    awake.current.delete(id);
                    rest_resends.current.set(id, REST_RESENDS);
                }

                const left = rest_resends.current.get(id);
                if (left !== undefined) {
                    send = true;
                    if (left <= 1) rest_resends.current.delete(id);
                    else rest_resends.current.set(id, left - 1);
                }

                // a client hands a claimed body back to the host once it has settled (a pinned one stays)
                if (!is_host && !held && body.isSleeping() && !rest_resends.current.has(id)
                    && get_body_owner(id) === room.self.id && !is_body_pinned(id) && !releasing.current.has(id)) {
                    releasing.current.add(id);
                    release_body(id);
                }

                if (!send) {
                    continue;
                }

                const p = body.translation();
                const q = body.rotation();
                const v = body.linvel();
                const w = body.angvel();
                entries.push([id, p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, w.x, w.y, w.z]);
            }

            // held objects (#23): grabbables that aren't dynamic bodies. their holder streams them while
            // they're in hand (plus the usual few resends once let go), then a client hands them
            // straight back: with no physics there's nothing to settle
            for (const id of get_held_objects()) {
                if (!is_simulated_locally(id)) {
                    continue;
                }

                const held = is_object_held(id);
                let send = false;
                if (held) {
                    awake.current.add(id);
                    rest_resends.current.delete(id);
                    send = true;
                } else if (awake.current.has(id)) {
                    awake.current.delete(id);
                    rest_resends.current.set(id, REST_RESENDS);
                }

                const left = rest_resends.current.get(id);
                if (left !== undefined) {
                    send = true;
                    if (left <= 1) rest_resends.current.delete(id);
                    else rest_resends.current.set(id, left - 1);
                }

                if (!is_host && !held && !rest_resends.current.has(id)
                    && get_body_owner(id) === room.self.id && !is_body_pinned(id) && !releasing.current.has(id)) {
                    releasing.current.add(id);
                    release_body(id);
                }

                if (!send) {
                    continue;
                }

                // a kinematic body if it has one (the grab drives that), else the node the grab moves
                const body = get_object_refs(id)?.current?.rigid_body.current;
                const { position, quaternion } = scratch.current;
                if (body && body.isValid()) {
                    const p = body.translation();
                    const q = body.rotation();
                    position.set(p.x, p.y, p.z);
                    quaternion.set(q.x, q.y, q.z, q.w);
                } else {
                    const target = get_grab_target(id);
                    if (!target) {
                        continue;
                    }
                    target.getWorldPosition(position);
                    target.getWorldQuaternion(quaternion);
                }
                entries.push([id, position.x, position.y, position.z, quaternion.x, quaternion.y, quaternion.z, quaternion.w, 0, 0, 0, 0, 0, 0]);
            }

            if (entries.length > 0) {
                const frame: PhysicsFrame = { t: session_now(), b: entries };
                room.send("others", PHYSICS_CHANNEL, JSON.stringify(frame), "unreliable");
            }
        }

        // 3. follow what others own
        const render_t = session_now() - BODY_INTERP_DELAY_MS;
        const { position, quaternion } = scratch.current;

        for (const [id, buffer] of get_body_buffers()) {
            const refs = get_object_refs(id)?.current;
            if (!refs) {
                forget_body(id);
                snapped.current.delete(id);
                continue;
            }

            const body = refs.rigid_body.current;

            // held objects (#23): drive their kinematic body, or the node the grab moves
            if (is_held_object(id)) {
                if (is_simulated_locally(id) || !buffer.sample(render_t, position, quaternion)) {
                    continue;
                }
                if (body && body.isValid()) {
                    if (!snapped.current.has(id) || body.bodyType() !== RigidBodyType.KinematicPositionBased) {
                        body.setTranslation(position, true);
                        body.setRotation(quaternion, true);
                        snapped.current.add(id);
                    }
                    body.setNextKinematicTranslation(position);
                    body.setNextKinematicRotation(quaternion);
                } else {
                    const target = get_grab_target(id);
                    if (target) {
                        set_world_pose(target, position, quaternion);
                    }
                }
                continue;
            }

            if (!body || !body.isValid() || is_simulated_locally(id)
                || body.bodyType() !== RigidBodyType.KinematicPositionBased) {
                continue;
            }

            if (!buffer.sample(render_t, position, quaternion)) {
                continue;
            }

            if (!snapped.current.has(id)) {
                body.setTranslation(position, true);
                body.setRotation(quaternion, true);
                snapped.current.add(id);
            }
            body.setNextKinematicTranslation(position);
            body.setNextKinematicRotation(quaternion);
        }
    }, -1);

    return null;
};
