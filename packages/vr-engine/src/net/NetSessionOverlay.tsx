import { useSetting } from "@hyperlinkvr/react";
import { useEffect, useState } from "react";

import { usePlayerPresenceStore } from "../player/presence_store";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";
import { useNetSession } from "./NetSession";
import { get_dynamic_bodies, get_held_objects, is_body_pinned, owns_body } from "./ownership";
import { get_pose_buffers } from "./pose_buffer";
import { get_clock_offset, get_clock_rtt } from "./session_clock";

// a debug readout of the multiplayer session, behind devtools → "Show multiplayer overlay".
// TODO: a player-facing version belongs on a watch screen (who's here, who's host, leave)

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex gap-2">
        <span className="text-gray-400 w-20 shrink-0">{label}</span>
        <span>{children}</span>
    </div>
);

const short = (id: string) => id.slice(0, 4);

// the ownership/latency figures change without anything re-rendering, so sample them a few times a second
const useTick = (ms: number) => {
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick((tick) => tick + 1), ms);
        return () => clearInterval(interval);
    }, [ms]);
};

const Overlay = () => {
    useTick(500);

    const { room, peers, host, mode, world_mode, join_failed, ended } = useNetSession();
    const world_ready = useWorldLoadingStateStore((s) => s.world_ready);
    const synced_with_host = useWorldLoadingStateStore((s) => s.synced_with_host);
    const spawned = usePlayerPresenceStore((s) => s.spawned);
    const entered = usePlayerPresenceStore((s) => s.entered);

    const is_host = !!room && room.self.id === host;

    const status = ended
        ? `ended (${ended})`
        : world_mode === "solo"
            ? "solo world"
            : join_failed
                ? "shared world, running solo (couldn't join)"
                : !room
                    ? "joining..."
                    : is_host ? "shared, host" : "shared, client";

    const dynamic = [...get_dynamic_bodies()];
    const owned = dynamic.filter((id) => owns_body(id)).length;
    const pinned = dynamic.filter((id) => is_body_pinned(id)).length;
    const held_objects = get_held_objects();
    const rtt = get_clock_rtt();
    const poses = get_pose_buffers();

    return (
        <div className="absolute top-10 left-4 z-40 rounded bg-black/70 px-3 py-2 text-xs text-white font-mono pointer-events-none flex flex-col gap-0.5 max-w-sm">
            <div className="font-semibold font-sans mb-1">Multiplayer</div>

            <Row label="status">{status}</Row>
            {mode === "shared" && room && (
                <>
                    <Row label="room">{room.key.world} / {room.key.instance}</Row>
                    <Row label="you">{room.self.username ?? "guest"} <span className="text-gray-400">{short(room.self.id)}</span></Row>
                    <Row label="transport">{room.capabilities.unreliable ? "reliable + unreliable" : "reliable only (websocket)"}</Row>
                    {!is_host && (
                        <Row label="host rtt">
                            {rtt === null ? "measuring..." : `${rtt.toFixed(0)}ms`}
                            <span className="text-gray-400"> clock {get_clock_offset() >= 0 ? "+" : ""}{get_clock_offset().toFixed(0)}ms</span>
                        </Row>
                    )}
                </>
            )}

            <Row label="world">
                {world_ready ? "ready" : "loading"}
                {mode === "shared" && room && !is_host && <>, {synced_with_host ? "synced with host" : "not synced"}</>}
            </Row>
            <Row label="player">{spawned ? "spawned" : "not spawned"}, {entered ? "entered" : "on play screen"}</Row>

            {mode === "shared" && room && (
                <>
                    <Row label="bodies">
                        {owned}/{dynamic.length} simulated here
                        {pinned > 0 && <span className="text-gray-400">, {pinned} pinned</span>}
                        {held_objects.length > 0 && <span className="text-gray-400">, {held_objects.length} held-object</span>}
                    </Row>

                    <div className="font-semibold font-sans mt-1">{peers.length} in room</div>
                    {peers.map((peer) => {
                        const self = peer.id === room.self.id;
                        return (
                            <div key={peer.id}>
                                {peer.username ?? "Guest"}
                                <span className="text-gray-400"> {short(peer.id)}</span>
                                {peer.id === host && <span className="text-amber-300"> host</span>}
                                {self && <span className="text-sky-300"> you</span>}
                                {/* a remote player's pose arrives once they've entered (play clicked) */}
                                {!self && (poses.has(peer.id)
                                    ? <span className="text-emerald-300"> in world</span>
                                    : <span className="text-gray-400"> not in yet</span>)}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
};

export const NetSessionOverlay = () => {
    const [enabled] = useSetting("devtools_show_net_overlay");
    return enabled ? <Overlay /> : null;
};
