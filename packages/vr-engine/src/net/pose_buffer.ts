import { Quaternion, Vector3 } from "three";

import type { HandTuple, PoseMessage, PoseTuple } from "./presence_protocol";

// how far behind a peer's newest pose we render, so there's usually a later pose to blend towards.
// needs to cover the send interval plus jitter
const INTERP_DELAY_MS = 100;

// the clock offset estimate is the smallest (arrival - send) seen recently, i.e. the least-delayed message
const OFFSET_WINDOW_MS = 3000;

const HISTORY_MS = 1000;

export interface SampledHand {
    visible: boolean;
    position: Vector3;
    quaternion: Quaternion;
    curl: number;
}

export interface SampledPose {
    head_position: Vector3;
    head_quaternion: Quaternion;
    left: SampledHand;
    right: SampledHand;
}

export const make_sampled_pose = (): SampledPose => {
    const hand = (): SampledHand => ({ visible: false, position: new Vector3(), quaternion: new Quaternion(), curl: 0 });
    return { head_position: new Vector3(), head_quaternion: new Quaternion(), left: hand(), right: hand() };
};

const scratch_position = new Vector3();
const scratch_quaternion = new Quaternion();

const blend_pose = (a: PoseTuple | HandTuple, b: PoseTuple | HandTuple, alpha: number, position: Vector3, quaternion: Quaternion) => {
    position.set(a[0], a[1], a[2]).lerp(scratch_position.set(b[0], b[1], b[2]), alpha);
    quaternion.set(a[3], a[4], a[5], a[6]).slerp(scratch_quaternion.set(b[3], b[4], b[5], b[6]), alpha);
};

const blend_hand = (a: HandTuple | null, b: HandTuple | null, alpha: number, out: SampledHand) => {
    // a hand that's only tracked on one side of the blend snaps rather than flying in from nowhere
    const from = a ?? b;
    const to = b ?? a;
    if (!from || !to) {
        out.visible = false;
        return;
    }

    out.visible = true;
    blend_pose(from, to, alpha, out.position, out.quaternion);
    out.curl = from[7] + (to[7] - from[7]) * alpha;
};

export class PoseBuffer {
    readonly #poses: PoseMessage[] = [];
    readonly #offset_samples: { at: number; offset: number }[] = [];
    #offset: number | null = null;

    push(pose: PoseMessage, local_now: number) {
        this.#offset_samples.push({ at: local_now, offset: local_now - pose.t });
        while (this.#offset_samples.length > 1 && local_now - this.#offset_samples[0]!.at > OFFSET_WINDOW_MS) {
            this.#offset_samples.shift();
        }
        this.#offset = Math.min(...this.#offset_samples.map((sample) => sample.offset));

        // unreliable delivery can reorder, so insert in send order and drop duplicates
        let index = this.#poses.length;
        while (index > 0 && this.#poses[index - 1]!.t > pose.t) {
            index--;
        }
        if (this.#poses[index - 1]?.t === pose.t) {
            return;
        }
        this.#poses.splice(index, 0, pose);

        const newest = this.#poses[this.#poses.length - 1]!.t;
        while (this.#poses.length > 2 && newest - this.#poses[0]!.t > HISTORY_MS) {
            this.#poses.shift();
        }
    }

    // writes the pose to show right now, false until anything has arrived
    sample(local_now: number, out: SampledPose): boolean {
        if (this.#offset === null || this.#poses.length === 0) {
            return false;
        }

        const render_t = local_now - this.#offset - INTERP_DELAY_MS;

        // hold the newest pose if we've run out, rather than extrapolating
        let from = this.#poses[this.#poses.length - 1]!;
        let to = from;
        for (let i = 0; i < this.#poses.length - 1; i++) {
            if (this.#poses[i + 1]!.t > render_t) {
                from = this.#poses[i]!;
                to = this.#poses[i + 1]!;
                break;
            }
        }

        const span = to.t - from.t;
        const alpha = span > 0 ? Math.min(Math.max((render_t - from.t) / span, 0), 1) : 0;

        blend_pose(from.head, to.head, alpha, out.head_position, out.head_quaternion);
        blend_hand(from.left, to.left, alpha, out.left);
        blend_hand(from.right, to.right, alpha, out.right);
        return true;
    }
}

const buffers = new Map<string, PoseBuffer>();

export const push_pose = (peer_id: string, pose: PoseMessage, local_now: number) => {
    let buffer = buffers.get(peer_id);
    if (!buffer) {
        buffer = new PoseBuffer();
        buffers.set(peer_id, buffer);
    }
    buffer.push(pose, local_now);
};

export const get_pose_buffer = (peer_id: string): PoseBuffer | undefined => buffers.get(peer_id);

// drop anyone who's left
export const retain_pose_buffers = (peer_ids: Set<string>) => {
    for (const peer_id of buffers.keys()) {
        if (!peer_ids.has(peer_id)) {
            buffers.delete(peer_id);
        }
    }
};

export const clear_pose_buffers = () => {
    buffers.clear();
};
