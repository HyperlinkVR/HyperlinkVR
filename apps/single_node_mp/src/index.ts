import { randomUUID } from "node:crypto";
import type { PeerHello, PeerID, PeerInfo, RoomKey } from "@hyperlinkvr/core";
import { WebSocket, WebSocketServer } from "ws";

import { encode, parse_client_frame, type ClientFrame, type ServerFrame } from "./protocol";


const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const MAX_BUFFERED_BYTES = 1 << 20;

const HEARTBEAT_MS = 30_000;

interface Peer {
    ws: WebSocket;
    info: PeerInfo;
    alive: boolean;
}

interface Room {
    peers: Map<PeerID, Peer>;
    host: PeerID;
}

const rooms = new Map<string, Room>();

const room_key_of = (key: RoomKey): string => `hvr-net:${key.world}#${key.instance}`;

let join_counter = 0;

// oldest join wins
const elect_host = (peers: Iterable<Peer>): PeerID => {
    let best: PeerInfo | null = null;
    for (const { info } of peers) {
        if (
            !best ||
            info.joined_at < best.joined_at ||
            (info.joined_at === best.joined_at && info.id < best.id)
        ) {
            best = info;
        }
    }
    return best!.id;
};

const send = (peer: Peer, frame: ServerFrame): void => {
    if (peer.ws.readyState !== WebSocket.OPEN) {
        return;
    }
    if (
        frame.t === "msg" &&
        frame.delivery === "unreliable" &&
        peer.ws.bufferedAmount > MAX_BUFFERED_BYTES
    ) {
        return;
    }
    peer.ws.send(encode(frame));
};

const broadcast = (room: Room, frame: ServerFrame, except?: PeerID): void => {
    for (const peer of room.peers.values()) {
        if (peer.info.id !== except) {
            send(peer, frame);
        }
    }
};

// relay a message from a peer to its target(s) in the room, with the sender's id attached
const relay = (room: Room, sender: Peer, frame: Extract<ClientFrame, { t: "msg" }>): void => {
    const out: ServerFrame = {
        t: "msg",
        from: sender.info.id,
        channel: frame.channel,
        delivery: frame.delivery,
        payload: frame.payload
    };

    const target = frame.target;
    if (target === "others") {
        broadcast(room, out, sender.info.id);
        return;
    }

    const to = target === "host" ? room.host : target.peer;
    if (to === sender.info.id) {
        return;
    }
    const dest = room.peers.get(to);
    if (dest) {
        send(dest, out);
    }
};

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, request) => {
    const url = new URL(request.url ?? "", "ws://fake_base");

    const world = url.searchParams.get("world");
    const instance = url.searchParams.get("instance");

    if (!world || !instance) {
        // no room to route to
        ws.send(encode({ t: "closed", reason: "rejected" }));
        ws.close();
        return;
    }

    // TODO: identity verification
    const hello: PeerHello = {
        username: url.searchParams.get("username"),
        display_name: url.searchParams.get("display_name") ?? undefined
    };

    const key = room_key_of({ world, instance });
    let room = rooms.get(key);
    if (!room) {
        room = { peers: new Map(), host: "" };
        rooms.set(key, room);
    }

    const info: PeerInfo = {
        ...hello,
        // adopt the claimed account id as the PeerID (mint one for guests / unauthed).
        // TODO: once identities are verified, reject/replace a duplicate id instead of trusting it
        id: url.searchParams.get("id") ?? randomUUID(),
        joined_at: join_counter++
    };

    const peer: Peer = { ws, info, alive: true };
    room.peers.set(info.id, peer);
    room.host = elect_host(room.peers.values());

    send(peer, {
        t: "welcome",
        self: info,
        peers: [...room.peers.values()].map((p) => p.info),
        host: room.host
    });
    broadcast(room, { t: "peer-joined", peer: info }, info.id);

    console.log(`Peer ${info.id} joined room ${key} (${room.peers.size} peers)`);

    ws.on("message", (data, is_binary) => {
        if (!is_binary) {
            // only binary messages are allowed as msgpackr is used
            return;
        }

        const bytes: Uint8Array = Array.isArray(data)
            ? (Buffer.concat(data as unknown as readonly Uint8Array[]) as unknown as Uint8Array)
            : data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : (data as unknown as Uint8Array);

        const frame = parse_client_frame(bytes);
        if (!frame) {
            return;
        }

        if (frame.t === "leave") {
            ws.close();
            return;
        }

        relay(room, peer, frame);
    });

    ws.on("pong", () => {
        peer.alive = true;
    });

    const depart = () => {
        console.log(`Peer ${info.id} left room ${key} (${room.peers.size - 1} peers)`);

        if (!room.peers.delete(info.id)) {
            return;
        }

        if (room.peers.size === 0) {
            rooms.delete(key);
            return;
        }

        broadcast(room, { t: "peer-left", peer_id: info.id });

        // re-elect host if the departing peer was the host
        const next_host = elect_host(room.peers.values());
        if (next_host !== room.host) {
            room.host = next_host;
            broadcast(room, { t: "host-changed", host: next_host });
        }
    };

    ws.on("close", depart);
    ws.on("error", () => ws.terminate());
});

const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
        for (const peer of room.peers.values()) {
            if (!peer.alive) {
                peer.ws.terminate();
                continue;
            }
            peer.alive = false;
            peer.ws.ping();
        }
    }
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeat));

console.log(`Multiplayer server running on ws://localhost:${PORT}`);

// TODO: reconnection and ratelimit
// TODO: webtransit unreliable channel
