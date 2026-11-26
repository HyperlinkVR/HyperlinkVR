// a clock shared across peers, so timed events (animation/tween/sound starts) line up everywhere.
// the host is the authority; a client estimates its offset to the host's clock (ClockSync).
// offset = session time - local time, in performance.now() ms. 0 on the host and in solo.

let offset = 0;
// round trip to the host of the sample the offset came from (the lowest seen), null on the host/solo
let rtt: number | null = null;

export const set_clock_offset = (ms: number) => {
    offset = ms;
};

export const get_clock_offset = () => offset;

export const set_clock_rtt = (ms: number | null) => {
    rtt = ms;
};

export const get_clock_rtt = () => rtt;

export const reset_clock = () => {
    offset = 0;
    rtt = null;
};

// current time on the shared session clock
export const session_now = () => performance.now() + offset;

// a session timestamp → this peer's local performance.now() timebase (for scheduling locally)
export const session_to_local = (session_ts: number) => session_ts - offset;

// a local performance.now() timestamp → session time (for putting on the wire)
export const local_to_session = (local_ts: number) => local_ts + offset;
