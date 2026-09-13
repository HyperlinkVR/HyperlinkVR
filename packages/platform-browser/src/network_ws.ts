import { Packr, Unpackr } from "msgpackr";
import type {
    ClientFrame,
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
    SendTarget,
    ServerFrame
} from "@hyperlinkvr/core";

export interface WSNetworkOptions {
    url: string;
    connect_timeout_ms?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

const packr = new Packr();
const unpackr = new Unpackr();

const encode = (frame: ClientFrame): Uint8Array => packr.pack(frame);

const parse_server_frame = (data: Uint8Array): ServerFrame | null => {
    let raw: unknown;
    try {
        raw = unpackr.unpack(data);
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null || typeof (raw as { t?: unknown }).t !== "string") {
        return null;
    }
    return raw as ServerFrame;
};

class WSNetworkRoom implements NetworkRoom {
    readonly key: RoomKey;
    readonly self: PeerInfo;

    // TODO: when webtransit impl'd, enable unreliable delivery
    readonly capabilities: RoomCapabilities = { unreliable: false };

    readonly #ws: WebSocket;
    readonly #peers = new Map<PeerID, PeerInfo>();
    #host: PeerID;
    #closed = false;

    readonly #message_handlers = new Set<(message: IncomingMessage) => void>();
    readonly #event_handlers = new Set<(event: RoomEvent) => void>();

    // messages can arrive before the caller attaches a handler, so buffer them until the first handler is attached
    #inbound_buffer: IncomingMessage[] | null = [];

    constructor(key: RoomKey, ws: WebSocket, welcome: Extract<ServerFrame, { t: "welcome" }>) {
        this.key = key;
        this.#ws = ws;
        this.self = welcome.self;
        this.#host = welcome.host;
        for (const peer of welcome.peers) {
            this.#peers.set(peer.id, peer);
        }

        // take the socket over from the engine's join() handshake
        ws.onmessage = (event) => this.#receive(event.data as ArrayBuffer);
        ws.onclose = () => this.#on_socket_gone();
        ws.onerror = () => this.#on_socket_gone();
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

        // never loops back to self
        const to = target === "others" ? null : target === "host" ? this.#host : target.peer;
        if (to === this.self.id) {
            return;
        }

        this.#ws.send(encode({ t: "msg", target, channel, delivery, payload }));
    }

    on_message(handler: (message: IncomingMessage) => void): () => void {
        this.#message_handlers.add(handler);

        // flush anything buffered before the first listener attached
        if (this.#inbound_buffer) {
            const buffered = this.#inbound_buffer;
            this.#inbound_buffer = null;
            for (const message of buffered) {
                this.#deliver(message);
            }
        }

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
        if (this.#closed) {
            return;
        }
        try {
            this.#ws.send(encode({ t: "leave" }));
        } catch {
            // socket already gone
        }
        this.#ws.close();
        this.#shutdown("left");
    }

    #receive(data: ArrayBuffer) {
        if (this.#closed) {
            return;
        }

        const frame = parse_server_frame(new Uint8Array(data));
        if (!frame) {
            return;
        }

        switch (frame.t) {
            case "msg":
                this.#on_message({
                    from: frame.from,
                    channel: frame.channel,
                    payload: frame.payload,
                    delivery: frame.delivery
                });
                break;
            case "peer-joined":
                this.#peers.set(frame.peer.id, frame.peer);
                this.#emit({ type: "peer-joined", peer: frame.peer });
                break;
            case "peer-left":
                this.#peers.delete(frame.peer_id);
                this.#emit({ type: "peer-left", peer_id: frame.peer_id });
                break;
            case "host-changed":
                this.#host = frame.host;
                this.#emit({ type: "host-changed", host: frame.host });
                break;
            case "closed":
                this.#shutdown(frame.reason);
                break;
            case "welcome":
                // ignore
                break;
        }
    }

    #on_message(message: IncomingMessage) {
        if (this.#inbound_buffer) {
            this.#inbound_buffer.push(message);
            return;
        }
        this.#deliver(message);
    }

    #deliver(message: IncomingMessage) {
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

    #on_socket_gone() {
        // TODO: reconnect logic
        this.#shutdown("connection-lost");
    }

    #shutdown(reason: RoomCloseReason) {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#emit({ type: "closed", reason });
        this.#message_handlers.clear();
        this.#event_handlers.clear();
    }
}

export class WSNetworkEngine implements NetworkEngine {
    readonly #url: string;
    readonly #connect_timeout_ms: number;

    constructor(options: WSNetworkOptions) {
        this.#url = options.url;
        this.#connect_timeout_ms = options.connect_timeout_ms ?? DEFAULT_CONNECT_TIMEOUT_MS;
    }

    join(key: RoomKey, hello: PeerHello): Promise<NetworkRoom> {
        return new Promise<NetworkRoom>((resolve, reject) => {
            const url = new URL(this.#url);
            url.searchParams.set("world", key.world);
            url.searchParams.set("instance", key.instance);
            if (hello.username) {
                url.searchParams.set("username", hello.username);
            }
            if (hello.display_name) {
                url.searchParams.set("display_name", hello.display_name);
            }
            if (hello.id) {
                url.searchParams.set("id", hello.id);
            }

            const ws = new WebSocket(url);
            ws.binaryType = "arraybuffer";

            const timeout = setTimeout(() => {
                cleanup();
                ws.close();
                reject(new Error("timed out waiting for room welcome"));
            }, this.#connect_timeout_ms);

            const cleanup = () => {
                clearTimeout(timeout);
                ws.onmessage = null;
                ws.onclose = null;
                ws.onerror = null;
            };

            // temporarily wait for only welcome, dropping any other frames until the room accepts or rejects the connection
            ws.onmessage = (event) => {
                const frame = parse_server_frame(new Uint8Array(event.data as ArrayBuffer));
                if (!frame) {
                    return;
                }
                if (frame.t === "welcome") {
                    cleanup();
                    resolve(new WSNetworkRoom(key, ws, frame));
                } else if (frame.t === "closed") {
                    cleanup();
                    ws.close();
                    reject(new Error(`room rejected the connection: ${frame.reason}`));
                }
            };

            ws.onclose = () => {
                cleanup();
                reject(new Error("connection closed before room welcome"));
            };
            ws.onerror = () => {
                cleanup();
                reject(new Error("connection failed before room welcome"));
            };
        });
    }
}
