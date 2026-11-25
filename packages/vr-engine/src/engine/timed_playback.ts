import type { Audio } from "three";

import { session_to_local } from "../net/session_clock";

// playback commands (play/restart) carry `fired_at`, the session time they were issued (stamped by the
// host). honouring it keeps sounds and effects in step across engines: a replicated play that arrives
// a network hop late starts that far in, and a late joiner replaying "play" (state_journal) hears a
// looping track at the same point as everyone else, while a one-shot that already finished stays silent

// seconds since the command was issued; 0 when it has no fired_at (issued here, just now)
export const seconds_since_fired = (args: any): number => {
    if (typeof args?.fired_at !== "number") {
        return 0;
    }
    return Math.max(0, (performance.now() - session_to_local(args.fired_at)) / 1000);
};

// starts `audio` as if it had begun `elapsed` seconds ago
export const play_audio_from = (audio: Audio<any>, elapsed: number) => {
    if (audio.isPlaying) {
        return;
    }

    // three's resume position. it's private, but it's what play() starts from and what pause() adds
    // to, so setting it (not `offset`) keeps a later pause/resume in the right place
    const internal = audio as unknown as { _progress: number };

    // paused part-way through: play means resume from there
    if (internal._progress > 0) {
        audio.play();
        return;
    }

    const duration = audio.buffer?.duration ?? 0;
    if (duration > 0 && elapsed > 0) {
        if (!audio.getLoop() && elapsed >= duration) {
            // a one-shot that already finished
            return;
        }
        internal._progress = audio.getLoop() ? elapsed % duration : elapsed;
    }
    audio.play();
};

// a non-looping effect (e.g. a particle burst) that would already have run its course
export const finished_one_shot = (looping: boolean | undefined, duration_s: number | undefined, elapsed: number) =>
    !looping && duration_s !== undefined && duration_s > 0 && elapsed > duration_s;
