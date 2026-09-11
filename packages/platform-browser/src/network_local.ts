import type {
    Delivery,
    IncomingMessage,
    NetworkEngine,
    NetworkRoom,
    Payload,
    PeerHello,
    PeerID,
    PeerInfo,
    RoomCapabilities,
    RoomCloseReason,
    RoomEvent,
    RoomKey,
    SendTarget
} from "@hyperlinkvr/core";


export interface LocalNetworkOptions {
    settle_ms?: number;
    heartbeat_ms?: number;
    timeout_ms?: number;

    // simulated conditions, applied on receive
    latency_ms?: number;
    jitter_ms?: number;

    // unreliable only, 0..1
    drop_rate?: number;
}

const DEFAULT_OPTIONS: Required<LocalNetworkOptions> = {
    settle_ms: 200,
    heartbeat_ms: 1000,
    timeout_ms: 4000,
    latency_ms: 0,
    jitter_ms: 0,
    drop_rate: 0
};

type RawPacket =
    | { t: "hello"; peer: PeerInfo }
    | { t: "here"; peer: PeerInfo; to: PeerID }
    | { t: "beat"; peer: PeerInfo }
    | { t: "bye"; id: PeerID }
    | { t: "msg"; from: PeerID; to: PeerID | null; channel: string; delivery: Delivery; payload: Payload };

type RawMessage = Extract<RawPacket, { t: "msg" }>;

// drained by a single timer, as timer order isn't guaranteed across different delays
interface PeerQueue {
    queue: { due: number; wire: RawMessage }[];
    timer: ReturnType<typeof setTimeout> | undefined;
}

const channel_name = (key: RoomKey) => `hvr-net:${key.world}#${key.instance}`;

const queue_key_for = (from: PeerID, channel: string) => from + " " + channel;

// oldest join wins, ties broken by id
const elect_host = (peers: Iterable<PeerInfo>): PeerID => {
    let best: PeerInfo | null = null;
    for (const peer of peers) {
        if (
            !best ||
            peer.joined_at < best.joined_at ||
            (peer.joined_at === best.joined_at && peer.id < best.id)
        ) {
            best = peer;
        }
    }

    return best!.id;
};

class LocalNetworkRoom implements NetworkRoom {
    readonly key: RoomKey;
    readonly self: PeerInfo;
    readonly capabilities: RoomCapabilities = { unreliable: true };

    readonly #options: Required<LocalNetworkOptions>;
    readonly #channel: BroadcastChannel;

    readonly #peers = new Map<PeerID, PeerInfo>();
    readonly #last_seen = new Map<PeerID, number>();

    readonly #reliable_lanes = new Map<string, PeerQueue>();
    readonly #pending_deliveries = new Set<ReturnType<typeof setTimeout>>();

    readonly #message_handlers = new Set<(message: IncomingMessage) => void>();
    readonly #event_handlers = new Set<(event: RoomEvent) => void>();

    #host: PeerID;
    #settled = false;
    #closed = false;
    #heartbeat: ReturnType<typeof setInterval> | undefined;

    constructor(key: RoomKey, self: PeerInfo, options: Required<LocalNetworkOptions>) {
        this.key = key;
        this.self = self;
        this.#options = options;

        this.#peers.set(self.id, self);
        this.#host = self.id;

        this.#channel = new BroadcastChannel(channel_name(key));
        this.#channel.onmessage = (event: MessageEvent) => this.#receive(event.data as RawPacket);
    }

    async open(): Promise<void> {
        this.#heartbeat = setInterval(this.#tick, this.#options.heartbeat_ms);
        if (typeof globalThis.addEventListener === "function") {
            globalThis.addEventListener("pagehide", this.#on_pagehide);
        }

        this.#post({ t: "hello", peer: this.self });

        await new Promise((resolve) => setTimeout(resolve, this.#options.settle_ms));

        this.#host = elect_host(this.#peers.values());
        this.#settled = true;
    }

    peers(): PeerInfo[] {
        return [...this.#peers.values()];
    }

    host(): PeerID {
        return this.#host;
    }

    send(target: SendTarget, channel: string, payload: Payload, delivery: Delivery = "reliable"): void {
        if (this.#closed) {
            return;
        }

        let to: PeerID | null;
        if (target === "others") {
            to = null;
        } else if (target === "host") {
            to = this.#host;
        } else {
            to = target.peer;
        }

        if (to === this.self.id) {
            return;
        }

        this.#post({ t: "msg", from: this.self.id, to, channel, delivery, payload });
    }

    on_message(handler: (message: IncomingMessage) => void): () => void {
        this.#message_handlers.add(handler);
        return () => {
            this.#message_handlers.delete(handler);
        };
    }

    on_event(handler: (event: RoomEvent) => void): () => void {
        this.#event_handlers.add(handler);
        return () => {
            this.#event_handlers.delete(handler);
        };
    }

    leave(): void {
        this.#close("left");
    }

    #post(packet: RawPacket) {
        try {
            this.#channel.postMessage(packet);
        } catch {
            // channel already closed
        }
    }

    #receive(packet: RawPacket) {
        if (this.#closed) {
            return;
        }

        switch (packet.t) {
            case "hello":
                this.#see(packet.peer);
                this.#post({ t: "here", peer: this.self, to: packet.peer.id });
                break;
            case "here":
                if (packet.to === this.self.id) {
                    this.#see(packet.peer);
                }
                break;
            case "beat":
                this.#see(packet.peer);
                break;
            case "bye":
                this.#forget(packet.id);
                break;
            case "msg":
                if (packet.to !== null && packet.to !== this.self.id) {
                    return;
                }

                // unknown senders have already timed out
                if (!this.#peers.has(packet.from)) {
                    return;
                }

                this.#last_seen.set(packet.from, performance.now());
                this.#schedule(packet);
                break;
        }
    }

    #see(peer: PeerInfo) {
        this.#last_seen.set(peer.id, performance.now());

        if (this.#peers.has(peer.id)) {
            return;
        }

        this.#peers.set(peer.id, peer);

        if (this.#settled) {
            this.#emit({ type: "peer-joined", peer });
            this.#reelect();
        }
    }

    #forget(peer_id: PeerID) {
        if (peer_id === this.self.id || !this.#peers.delete(peer_id)) {
            return;
        }

        this.#last_seen.delete(peer_id);

        const queue_prefix = peer_id + " ";
        for (const [queue_key, queue] of this.#reliable_lanes) {
            if (queue_key.startsWith(queue_prefix)) {
                clearTimeout(queue.timer);
                this.#reliable_lanes.delete(queue_key);
            }
        }

        if (this.#settled) {
            this.#emit({ type: "peer-left", peer_id });
            this.#reelect();
        }
    }

    #reelect() {
        const next = elect_host(this.#peers.values());
        if (next === this.#host) {
            return;
        }

        this.#host = next;
        this.#emit({ type: "host-changed", host: next });
    }

    #tick = () => {
        this.#post({ t: "beat", peer: this.self });

        const now = performance.now();
        for (const [peer_id, seen] of this.#last_seen) {
            if (now - seen > this.#options.timeout_ms) {
                this.#forget(peer_id);
            }
        }
    };

    #schedule(msg: RawMessage) {
        const { latency_ms, jitter_ms, drop_rate } = this.#options;

        if (msg.delivery === "unreliable" && drop_rate > 0 && Math.random() < drop_rate) {
            return;
        }

        if (latency_ms <= 0 && jitter_ms <= 0) {
            this.#dispatch(msg);
            return;
        }

        const now = performance.now();
        const due = now + latency_ms + Math.random() * jitter_ms;

        if (msg.delivery === "reliable") {
            const lane_key = queue_key_for(msg.from, msg.channel);
            let lane = this.#reliable_lanes.get(lane_key);
            if (!lane) {
                lane = { queue: [], timer: undefined };
                this.#reliable_lanes.set(lane_key, lane);
            }

            const previous_due = lane.queue.at(-1)?.due ?? 0;
            lane.queue.push({ due: Math.max(due, previous_due), wire: msg });

            if (lane.timer === undefined) {
                this.#arm_queue(lane_key, lane);
            }
            return;
        }

        const timeout = setTimeout(() => {
            this.#pending_deliveries.delete(timeout);
            if (!this.#closed) {
                this.#dispatch(msg);
            }
        }, due - now);
        this.#pending_deliveries.add(timeout);
    }

    #arm_queue(queue_key: string, queue: PeerQueue) {
        const head = queue.queue[0]!;

        queue.timer = setTimeout(() => {
            queue.timer = undefined;
            if (this.#closed) {
                return;
            }

            // head always goes even if the timer was early
            const now = performance.now();
            do {
                this.#dispatch(queue.queue.shift()!.wire);
            } while (queue.queue.length > 0 && queue.queue[0]!.due <= now);

            if (queue.queue.length > 0) {
                this.#arm_queue(queue_key, queue);
            } else {
                this.#reliable_lanes.delete(queue_key);
            }
        }, head.due - performance.now());
    }

    #dispatch(msg: RawMessage) {
        const message: IncomingMessage = {
            from: msg.from,
            channel: msg.channel,
            payload: msg.payload,
            delivery: msg.delivery
        };

        for (const handler of this.#message_handlers) {
            try {
                handler(message);
            } catch (error) {
                console.error("Error in network message handler:", error);
            }
        }
    }

    #emit(event: RoomEvent) {
        for (const handler of this.#event_handlers) {
            try {
                handler(event);
            } catch (error) {
                console.error("Error in network event handler:", error);
            }
        }
    }

    #on_pagehide = () => this.leave();

    #close(reason: RoomCloseReason) {
        if (this.#closed) {
            return;
        }

        this.#post({ t: "bye", id: this.self.id });
        this.#closed = true;

        clearInterval(this.#heartbeat);
        for (const timeout of this.#pending_deliveries) {
            clearTimeout(timeout);
        }
        this.#pending_deliveries.clear();
        for (const lane of this.#reliable_lanes.values()) {
            clearTimeout(lane.timer);
        }
        this.#reliable_lanes.clear();

        if (typeof globalThis.removeEventListener === "function") {
            globalThis.removeEventListener("pagehide", this.#on_pagehide);
        }

        this.#channel.close();

        this.#emit({ type: "closed", reason });
        this.#message_handlers.clear();
        this.#event_handlers.clear();
    }
}

export class LocalNetworkEngine implements NetworkEngine {
    readonly #options: Required<LocalNetworkOptions>;

    constructor(options: LocalNetworkOptions = {}) {
        this.#options = { ...DEFAULT_OPTIONS, ...options };
    }

    // rooms share the options object, so this applies to open rooms without rejoining
    set_conditions(conditions: Pick<LocalNetworkOptions, "latency_ms" | "jitter_ms" | "drop_rate">) {
        Object.assign(this.#options, conditions);
    }

    async join(key: RoomKey, hello: PeerHello): Promise<NetworkRoom> {
        const self: PeerInfo = {
            ...hello,
            id: crypto.randomUUID(),
            // epoch-based so it orders across windows
            joined_at: performance.timeOrigin + performance.now()
        };

        const room = new LocalNetworkRoom(key, self, this.#options);
        await room.open();
        return room;
    }
}
