import type {Animation} from "@hyperlinkvr/vr-engine-schemas";
import {compile_track, type CompiledTrack} from "./tracks";

export interface ActiveAnimation {
    id: string;
    tracks: CompiledTrack[];
    duration_ms: number;
    loop: boolean;
    // world clock reading that maps to time zero
    epoch: number;
    // elapsed at the moment of pausing, or undefined while playing
    paused_elapsed?: number;
    finished: boolean;
}

const active = new Map<string, ActiveAnimation>();

export const start_animation = (id: string, animation: Animation, epoch: number) => {
    const tracks = animation.tracks.map(compile_track);
    const derived = tracks.reduce((longest, track) => Math.max(longest, track.end_time), 0);

    active.set(id, {
        id,
        tracks,
        duration_ms: animation.duration_ms ?? derived,
        loop: animation.loop ?? false,
        epoch,
        finished: false
    });
};

export const stop_animation = (id: string) => active.delete(id);

export const pause_animation = (id: string, now: number) => {
    const running = active.get(id);
    if (!running || running.paused_elapsed !== undefined) return;
    running.paused_elapsed = now - running.epoch;
};

export const resume_animation = (id: string, now: number) => {
    const running = active.get(id);
    if (!running || running.paused_elapsed === undefined) return;
    running.epoch = now - running.paused_elapsed;
    running.paused_elapsed = undefined;
    running.finished = false;
};

export const seek_animation = (id: string, time_ms: number, now: number) => {
    const running = active.get(id);
    if (!running) return;

    if (running.paused_elapsed !== undefined) {
        running.paused_elapsed = time_ms;
    } else {
        running.epoch = now - time_ms;
    }
    running.finished = false;
};

export const get_active_animations = () => active.values();

// elapsed rather than accumulated delta, so two peers given the same epoch agree
export const sample_time = (running: ActiveAnimation, now: number) => {
    const elapsed = running.paused_elapsed ?? now - running.epoch;

    if (running.loop) {
        return running.duration_ms > 0 ? elapsed % running.duration_ms : 0;
    }

    return Math.min(elapsed, running.duration_ms);
};
