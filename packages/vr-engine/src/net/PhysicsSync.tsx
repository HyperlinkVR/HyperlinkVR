// host physics streaming (#21). the host simulates every dynamic body; on a client those bodies are
// kinematic (ObjectPhysics, #20) and follow this stream.
//
// built to survive an unreliable transport even though the websocket carrier is reliable today
// (WebTransport, #19, slots in underneath with no change here): every frame carries full absolute
// poses stamped in session time, so a dropped or reordered frame only costs smoothness. only moving
// bodies are sent; when one falls asleep it's sent a few more times so a dropped final frame can't
// leave a client holding a stale pose.
//
// velocity isn't streamed yet — a kinematic follower doesn't need it. grab handoff (#22) will.

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import { get_all_object_refs, get_object_refs } from "../engine/object_ref_registry";
import { is_object_held } from "../interaction/util/holders";
import { is_simulated_locally } from "./authority";
import { BODY_INTERP_DELAY_MS, clear_body_buffers, forget_body, get_body_buffers, push_body_sample } from "./body_stream";
import { PHYSICS_CHANNEL } from "./command_bus";
import { useNetSession } from "./NetSession";
import { session_now } from "./session_clock";

const SEND_INTERVAL_MS = 1000 / 30;
const REST_RESENDS = 3;

// rapier RigidBodyType
const DYNAMIC = 0;
const KINEMATIC_POSITION = 2;

// [id, px, py, pz, qx, qy, qz, qw]
type BodyEntry = [string, number, number, number, number, number, number, number];

interface PhysicsFrame {
    t: number; // host session time the poses were read
    b: BodyEntry[];
}

export const PhysicsSync = () => {
    const { room, mode } = useNetSession();
    const is_host = mode === "shared" && !!room && room.self.id === room.host();
    const is_shared_client = mode === "shared" && !!room && room.self.id !== room.host();

    // host bookkeeping
    const awake = useRef(new Set<string>());
    const rest_resends = useRef(new Map<string, number>());
    const since_send = useRef(0);

    // client bookkeeping: bodies already teleported onto the stream, so the first sample snaps
    // rather than interpolating from wherever the body spawned (the same trap ObjectPhysics' kinematic
    // first-write guards against)
    const snapped = useRef(new Set<string>());
    const scratch = useRef({ position: new Vector3(), quaternion: new Quaternion() });

    useEffect(() => {
        awake.current.clear();
        rest_resends.current.clear();
        snapped.current.clear();
        since_send.current = 0;
    }, [room, is_host]);

    // client: buffer the host's frames. only the host may drive our bodies (`from` is server-stamped)
    useEffect(() => {
        if (!room || !is_shared_client) {
            return;
        }
        const off = room.on_message((message) => {
            if (message.channel !== PHYSICS_CHANNEL || message.from !== room.host()) {
                return;
            }
            const frame = JSON.parse(message.payload as string) as PhysicsFrame;
            for (const [id, px, py, pz, qx, qy, qz, qw] of frame.b) {
                push_body_sample(id, { t: frame.t, p: [px, py, pz], q: [qx, qy, qz, qw] });
            }
        });
        return () => {
            off();
            clear_body_buffers();
        };
    }, [room, is_shared_client]);

    // runs before the physics step so client kinematic targets land this frame
    useFrame((_, delta) => {
        if (!room) {
            return;
        }

        if (is_host) {
            since_send.current += delta * 1000;
            if (since_send.current < SEND_INTERVAL_MS) {
                return;
            }
            since_send.current %= SEND_INTERVAL_MS;

            const seen = new Set<string>();
            const bodies: BodyEntry[] = [];

            for (const ref of get_all_object_refs()) {
                const refs = ref.current;
                const body = refs?.rigid_body.current;
                if (!refs || !body || !body.isValid()) {
                    continue;
                }

                const id = refs.id;
                // a non-physical grab flips a dynamic body kinematic while it's held (Grabbable), so
                // stream held objects by what they are, not by the body's current type
                const held = is_object_held(id);
                if (body.bodyType() !== DYNAMIC && !(held && body.bodyType() === KINEMATIC_POSITION)) {
                    continue;
                }

                seen.add(id);

                let send = false;
                if (held || !body.isSleeping()) {
                    awake.current.add(id);
                    rest_resends.current.delete(id);
                    send = true;
                } else if (awake.current.has(id)) {
                    // just came to rest: send the resting pose a few more times
                    awake.current.delete(id);
                    rest_resends.current.set(id, REST_RESENDS);
                }

                const left = rest_resends.current.get(id);
                if (left !== undefined) {
                    send = true;
                    if (left <= 1) rest_resends.current.delete(id);
                    else rest_resends.current.set(id, left - 1);
                }

                if (!send) {
                    continue;
                }

                const p = body.translation();
                const q = body.rotation();
                bodies.push([id, p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
            }

            // forget bodies that have been destroyed
            for (const id of awake.current) if (!seen.has(id)) awake.current.delete(id);
            for (const id of rest_resends.current.keys()) if (!seen.has(id)) rest_resends.current.delete(id);

            if (bodies.length > 0) {
                const frame: PhysicsFrame = { t: session_now(), b: bodies };
                room.send("others", PHYSICS_CHANNEL, JSON.stringify(frame), "unreliable");
            }
            return;
        }

        if (is_shared_client) {
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
                // only drive bodies this engine has actually handed to the host and flipped kinematic
                if (!body || !body.isValid() || is_simulated_locally(id) || body.bodyType() !== KINEMATIC_POSITION) {
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
        }
    }, -1);

    return null;
};
