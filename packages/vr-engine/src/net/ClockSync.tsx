// estimates a client's offset to the host's session clock, NTP-style (#9). the host is the time
// authority (offset 0) and just answers pings; a client pings, measures round-trip, and keeps the
// offset from its lowest-RTT sample (least jitter). reliable channel, so RTT includes the relay hop
// — fine for lining up animation/tween starts, which only need ~frame accuracy.

import { useEffect } from "react";

import { CLOCK_CHANNEL } from "./command_bus";
import { useNetSession } from "./NetSession";
import { reset_clock, set_clock_offset } from "./session_clock";

interface Ping {
    id: number;
    t0: number; // client local send time
}
interface Pong extends Ping {
    host_t: number; // host clock (== host session time) at receipt
}

export const ClockSync = () => {
    const { room } = useNetSession();

    useEffect(() => {
        if (!room) {
            reset_clock();
            return;
        }

        const is_host = () => room.self.id === room.host();
        if (is_host()) {
            reset_clock(); // authority: session time == local time
        }

        let best_rtt = Infinity;

        const off_message = room.on_message((message) => {
            if (message.channel !== CLOCK_CHANNEL) {
                return;
            }
            const data = JSON.parse(message.payload as string) as Ping | Pong;

            if ("host_t" in data) {
                // client: got a pong — offset from the lowest-RTT sample
                const t3 = performance.now();
                const rtt = t3 - data.t0;
                if (rtt < best_rtt) {
                    best_rtt = rtt;
                    // host clock at t3 ≈ host_t + rtt/2; offset = (host clock at t3) - t3
                    set_clock_offset(data.host_t + rtt / 2 - t3);
                }
            } else if (is_host()) {
                // host: answer with our clock (session time)
                const pong: Pong = { ...data, host_t: performance.now() };
                room.send({ peer: message.from }, CLOCK_CHANNEL, JSON.stringify(pong), "reliable");
            }
        });

        let interval: ReturnType<typeof setInterval> | null = null;
        if (!is_host()) {
            let ping_id = 0;
            const ping = () => {
                const message: Ping = { id: ping_id++, t0: performance.now() };
                room.send("host", CLOCK_CHANNEL, JSON.stringify(message), "reliable");
            };
            // TODO: a short burst on join then a slow keepalive; single cadence for now
            ping();
            interval = setInterval(ping, 5000);
        }

        return () => {
            off_message();
            if (interval) {
                clearInterval(interval);
            }
            reset_clock();
        };
    }, [room]);

    return null;
};
