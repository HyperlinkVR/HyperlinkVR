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
import { Quaternion, Vector3 } from "three";

import { get_object_refs } from "../engine/object_ref_registry";
import { is_object_held } from "../interaction/util/holders";
import { is_simulated_locally } from "./authority";
import { clear_body_buffers, forget_body, get_body_buffers, latest_body_velocity, push_body_sample, BODY_INTERP_DELAY_MS } from "./body_stream";
import { OWNERSHIP_CHANNEL, PHYSICS_CHANNEL } from "./command_bus";
import { useNetSession } from "./NetSession";
import {
    configure_ownership,
    get_body_owner,
    get_dynamic_bodies,
    get_owner_overrides,
    on_body_owner_change,
    owns_body,
    release_body,
    set_body_owner,
    set_ownership_sender
} from "./ownership";
import { session_now } from "./session_clock";

const SEND_INTERVAL_MS = 1000 / 30;
const REST_RESENDS = 3;

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
    | { type: "claim"; id: string }
    | { type: "release"; id: string }
    | { type: "owner"; id: string; owner: PeerID | null }
    | { type: "table"; owners: [string, PeerID][] };

export const PhysicsSync = () => {
    const { room, mode } = useNetSession();
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
        since_send.current = 0;
    }, [room, is_host]);

    useEffect(() => {
        if (!shared || !room) {
            return;
        }

        const send = (target: Parameters<typeof room.send>[0], message: OwnershipMessage) =>
            room.send(target, OWNERSHIP_CHANNEL, JSON.stringify(message), "reliable");

        const assign = (id: string, owner: PeerID | null) => {
            set_body_owner(id, owner);
            send("others", { type: "owner", id, owner });
        };

        // a client's claims and releases go to the host. the host never asks anyone
        set_ownership_sender(is_host ? null : (request) => send("host", request));

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
                if (request.type === "claim") {
                    const current = get_body_owner(request.id);
                    // taken if another peer has it, or it's in one of the host's own hands
                    const taken = (current !== room.self.id && current !== message.from) || is_object_held(request.id);
                    if (taken) {
                        // correct the claimer; they'll let go
                        send({ peer: message.from }, { type: "owner", id: request.id, owner: current === room.self.id ? null : current });
                    } else {
                        assign(request.id, message.from);
                    }
                } else if (request.type === "release" && get_body_owner(request.id) === message.from) {
                    assign(request.id, null);
                }
                return;
            }

            // a client takes the host's word on who owns what
            if (message.from !== room.host()) {
                return;
            }
            if (request.type === "owner") {
                set_body_owner(request.id, request.owner);
            } else if (request.type === "table") {
                for (const [id, owner] of request.owners) {
                    set_body_owner(id, owner);
                }
            }
        });

        // host: brief newcomers on current claims, and take back anything a leaver owned
        const off_event = room.on_event((event) => {
            if (!is_host) {
                return;
            }
            if (event.type === "peer-joined") {
                send({ peer: event.peer.id }, { type: "table", owners: get_owner_overrides() });
            } else if (event.type === "peer-left") {
                for (const [id, owner] of get_owner_overrides()) {
                    if (owner === event.peer_id) {
                        assign(id, null);
                    }
                }
            }
        });

        return () => {
            off_message();
            off_event();
            set_ownership_sender(null);
            clear_body_buffers();
        };
    }, [shared, room, is_host]);

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

                // a client hands a claimed body back to the host once it has settled
                if (!is_host && !held && body.isSleeping() && !rest_resends.current.has(id)
                    && get_body_owner(id) === room.self.id && !releasing.current.has(id)) {
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
