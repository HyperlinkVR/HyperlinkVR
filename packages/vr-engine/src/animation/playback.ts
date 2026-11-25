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
    // stays in the map but no longer asserts or advances its tracks, so another writer (e.g. a seek)
    // can own the target. a non-looping animation auto-releases on finish; play/restart revives it
    released: boolean;
    // per-track base pose for relative tracks, captured lazily on the first applied frame after a
    // (re)start and cleared on resume so a replay recaptures. null until captured or for absolute tracks
    bases: Array<number[] | null>;
}

const active = new Map<string, ActiveAnimation>();

// each live animation's definition as it was dispatched (plain json), so a late joiner can be given it
const definitions = new Map<string, unknown>();

export const remember_animation_definition = (id: string, raw: unknown) => {
    definitions.set(id, raw);
};

// the playback state a late joiner needs to pick an animation up exactly where the host has it.
// epoch is converted to/from session time by the caller
export interface AnimationPlaybackState {
    epoch: number;
    paused_elapsed?: number;
    released: boolean;
    bases: Array<number[] | null>;
}

export const get_animation_snapshot = (): { id: string; animation: unknown; state: AnimationPlaybackState }[] => {
    const out = [];
    for (const running of active.values()) {
        const animation = definitions.get(running.id);
        if (animation === undefined) continue;
        out.push({
            id: running.id,
            animation,
            state: {
                epoch: running.epoch,
                paused_elapsed: running.paused_elapsed,
                released: running.released,
                // relative tracks' captured base poses: a joiner's object is already mid-animation,
                // so capturing its own base would double the offset
                bases: running.bases
            }
        });
    }
    return out;
};

export const restore_animation_state = (id: string, state: AnimationPlaybackState) => {
    const running = active.get(id);
    if (!running) return;
    running.epoch = state.epoch;
    running.paused_elapsed = state.paused_elapsed;
    running.released = state.released;
    running.bases = state.bases.length === running.tracks.length ? state.bases : running.tracks.map(() => null);
};

export const start_animation = (id: string, animation: Animation, epoch: number) => {
    const tracks = animation.tracks.map(compile_track);
    const derived = tracks.reduce((longest, track) => Math.max(longest, track.end_time), 0);

    active.set(id, {
        id,
        tracks,
        duration_ms: animation.duration_ms ?? derived,
        loop: animation.loop ?? false,
        epoch,
        released: false,
        bases: tracks.map(() => null)
    });
};

export const stop_animation = (id: string) => {
    definitions.delete(id);
    return active.delete(id);
};

// hold the target where it is and stop asserting/advancing, without removing the animation so it can
// be replayed. used by the "stop" command and by the runner when a non-looping animation finishes
export const release_animation = (id: string) => {
    const running = active.get(id);
    if (running) running.released = true;
};

export const pause_animation = (id: string, now: number) => {
    const running = active.get(id);
    if (!running || running.paused_elapsed !== undefined) return;
    running.paused_elapsed = now - running.epoch;
};

export const resume_animation = (id: string, now: number) => {
    const running = active.get(id);
    if (!running) return;

    if (running.paused_elapsed !== undefined) {
        running.epoch = now - running.paused_elapsed;
        running.paused_elapsed = undefined;
    }
    // reviving from released or finished: recapture relative bases against the current pose
    running.released = false;
    running.bases = running.bases.map(() => null);
};

export const seek_animation = (id: string, time_ms: number, now: number) => {
    const running = active.get(id);
    if (!running) return;

    if (running.paused_elapsed !== undefined) {
        running.paused_elapsed = time_ms;
    } else {
        running.epoch = now - time_ms;
    }
};

export const get_active_animations = () => active.values();

export const clear_animations = () => {
    active.clear();
    definitions.clear();
};

// elapsed rather than accumulated delta, so two peers given the same epoch agree
export const sample_time = (running: ActiveAnimation, now: number) => {
    const elapsed = running.paused_elapsed ?? now - running.epoch;

    if (running.loop) {
        return running.duration_ms > 0 ? elapsed % running.duration_ms : 0;
    }

    return Math.min(elapsed, running.duration_ms);
};
