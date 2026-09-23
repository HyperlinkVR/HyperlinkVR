// a session clock shared across peers so timed events (animation/tween starts) line up everywhere
// (#9). the host is the authority (offset 0); a client estimates its offset to host time NTP-style
// (see ClockSync). all values are in performance.now() milliseconds.
//
// offset = session_time - local_time. 0 on the host and in solo, so every conversion below is the
// identity there — this changes nothing until a client actually syncs.
let offset = 0;

export const set_clock_offset = (ms: number) => {
    offset = ms;
};

export const get_clock_offset = () => offset;

export const reset_clock = () => {
    offset = 0;
};

// current time on the shared session clock
export const session_now = () => performance.now() + offset;

// a session timestamp → this peer's local performance.now() timebase (for scheduling locally)
export const session_to_local = (session_ts: number) => session_ts - offset;

// a local performance.now() timestamp → session time (for putting on the wire)
export const local_to_session = (local_ts: number) => local_ts + offset;
