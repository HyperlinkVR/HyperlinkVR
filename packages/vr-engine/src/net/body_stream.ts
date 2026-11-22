import { Quaternion, Vector3 } from "three";

// client-side buffer for host-streamed physics bodies (#21). each sample is a full pose stamped in
// session time (#9), so unlike the presence PoseBuffer there's no offset to estimate — sample at
// session_now() minus a fixed delay and blend between the two samples around it. a lost or late
// sample only costs smoothness, never correctness: every sample stands alone.

// render this far behind the newest sample so there's usually a later one to blend towards. covers
// the send interval (~33ms at 30Hz) plus jitter
export const BODY_INTERP_DELAY_MS = 100;

const HISTORY_MS = 1000;

interface BodySample {
    t: number;
    p: [number, number, number];
    q: [number, number, number, number];
}

const scratch = new Vector3();
const scratch_q = new Quaternion();

class BodyBuffer {
    readonly #samples: BodySample[] = [];

    push(sample: BodySample) {
        // unreliable delivery can reorder: insert in send order, drop duplicates
        let index = this.#samples.length;
        while (index > 0 && this.#samples[index - 1]!.t > sample.t) {
            index--;
        }
        if (this.#samples[index - 1]?.t === sample.t) {
            return;
        }
        this.#samples.splice(index, 0, sample);

        const newest = this.#samples[this.#samples.length - 1]!.t;
        while (this.#samples.length > 2 && newest - this.#samples[0]!.t > HISTORY_MS) {
            this.#samples.shift();
        }
    }

    // writes the pose to show at render_t (session time); holds the newest once we run past it (a
    // body at rest stops being streamed, so holding is exactly right). false until anything arrives
    sample(render_t: number, position: Vector3, quaternion: Quaternion): boolean {
        if (this.#samples.length === 0) {
            return false;
        }

        let from = this.#samples[this.#samples.length - 1]!;
        let to = from;
        for (let i = 0; i < this.#samples.length - 1; i++) {
            if (this.#samples[i + 1]!.t > render_t) {
                from = this.#samples[i]!;
                to = this.#samples[i + 1]!;
                break;
            }
        }

        const span = to.t - from.t;
        const alpha = span > 0 ? Math.min(Math.max((render_t - from.t) / span, 0), 1) : 0;

        position.set(from.p[0], from.p[1], from.p[2]).lerp(scratch.set(to.p[0], to.p[1], to.p[2]), alpha);
        quaternion
            .set(from.q[0], from.q[1], from.q[2], from.q[3])
            .slerp(scratch_q.set(to.q[0], to.q[1], to.q[2], to.q[3]), alpha);
        return true;
    }
}

const buffers = new Map<string, BodyBuffer>();

export const push_body_sample = (id: string, sample: BodySample) => {
    let buffer = buffers.get(id);
    if (!buffer) {
        buffer = new BodyBuffer();
        buffers.set(id, buffer);
    }
    buffer.push(sample);
};

export const get_body_buffers = (): ReadonlyMap<string, BodyBuffer> => buffers;

export const forget_body = (id: string) => {
    buffers.delete(id);
};

export const clear_body_buffers = () => {
    buffers.clear();
};
