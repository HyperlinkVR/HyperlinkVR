import type {
    MessageChannel as HVRMessageChannel,
    MessageEngine,
    SenderInfo
} from "@hyperlinkvr/core";

const protocol_key = "__HYPERLINKVR__";

// signalling envelope
type MessageEnvelope =
    | { __protocol: typeof protocol_key; kind: "ONE_OFF_REQ"; id: string; payload: any }
    | { __protocol: typeof protocol_key; kind: "ONE_OFF_RES"; id: string; payload: any }
    | { __protocol: typeof protocol_key; kind: "CONNECT"; name: string }
    | { __protocol: typeof protocol_key; kind: "PORT_DISCONNECT" };

const is_envelope = (data: unknown): data is MessageEnvelope =>
    !!data && typeof data === "object" && (data as MessageEnvelope).__protocol === protocol_key;

// sender info can be fixed, or resolved per message where it tracks something live like a url
type SenderSource = SenderInfo | (() => SenderInfo);

const resolve_sender = (source: SenderSource | undefined): SenderInfo =>
    typeof source === "function" ? source() : (source ?? {});

const wrap_message_port = <Tx, Rx>(
    port: MessagePort,
    name: string
): HVRMessageChannel<Tx, Rx> => {
    const disconnect_handlers = new Set<() => void>();
    const message_handlers = new Set<(payload: Rx) => void>();
    let is_disconnected = false;

    const trigger_disconnect = () => {
        if (is_disconnected) return;
        is_disconnected = true;

        window.removeEventListener("pagehide", on_unload);

        disconnect_handlers.forEach((handler) => handler());
        disconnect_handlers.clear();
        message_handlers.clear();

        try {
            port.close();
        } catch {
            // ignore
        }
    };

    function on_unload() {
        try {
            port.postMessage({ __protocol: protocol_key, kind: "PORT_DISCONNECT" });
        } catch {
            // ignore
        }
        trigger_disconnect();
    }

    port.addEventListener("message", (event: MessageEvent) => {
        if (is_disconnected) return;

        const data = event.data;
        if (is_envelope(data) && data.kind === "PORT_DISCONNECT") {
            trigger_disconnect();
            return;
        }

        message_handlers.forEach((handler) => handler(data as Rx));
    });

    port.start();

    // fast disconnect
    window.addEventListener("pagehide", on_unload);

    return {
        name,

        send: async (payload: Tx) => {
            if (is_disconnected) {
                throw new Error(`Cannot send message on channel "${name}": Port is disconnected.`);
            }
            port.postMessage(payload);
        },

        listen: (handler) => {
            message_handlers.add(handler);
            return () => {
                message_handlers.delete(handler);
            };
        },

        on_disconnect: (handler) => {
            disconnect_handlers.add(handler);
            return () => {
                disconnect_handlers.delete(handler);
            };
        },

        disconnect: () => {
            if (!is_disconnected) {
                try {
                    port.postMessage({ __protocol: protocol_key, kind: "PORT_DISCONNECT" });
                } catch {
                    // ignore
                }
                trigger_disconnect();
            }
        }
    };
};

export interface BrowserMessageEngineOptions {
    target?: Window;
    target_origin?: string;


    accept_origin?: string;
    sender?: SenderSource;

    send_timeout_ms?: number;
}

const DEFAULT_SEND_TIMEOUT_MS = 30_000;


export class BrowserMessageEngine implements MessageEngine {
    #target_window: Window;
    readonly #target_origin: string;
    readonly #accept_origin: string;
    readonly #send_timeout_ms: number;

    #target_sender: SenderSource | undefined;

    // extra inbound sources, for engines that serve several windows
    readonly #peers = new Map<Window, SenderSource | undefined>();

    readonly #message_handlers = new Set<
        (event: any, sender: SenderInfo) => Promise<any>
    >();
    readonly #connect_handlers = new Set<{
        name: string | undefined;
        handler: (channel: HVRMessageChannel<any, any>) => void;
    }>();

    #message_listener: ((event: MessageEvent) => void) | null = null;
    #connect_listener: ((event: MessageEvent) => void) | null = null;

    constructor(options: BrowserMessageEngineOptions = {}) {
        this.#target_window = options.target ?? window.opener ?? window.parent;
        this.#target_origin = options.target_origin ?? "*";
        this.#accept_origin = options.accept_origin ?? window.location.origin;
        this.#send_timeout_ms = options.send_timeout_ms ?? DEFAULT_SEND_TIMEOUT_MS;
        this.#target_sender = options.sender;
    }

    set_target_window = (target: Window, sender?: SenderSource) => {
        this.#target_window = target;
        if (sender !== undefined) {
            this.#target_sender = sender;
        }
    };

    add_peer = (peer: Window, sender?: SenderSource) => {
        this.#peers.set(peer, sender);
    };

    remove_peer = (peer: Window) => {
        this.#peers.delete(peer);
    };

    #resolve_sender = (event: MessageEvent): SenderInfo | undefined => {
        if (event.origin !== this.#accept_origin) {
            return undefined;
        }

        const source = event.source as Window | null;
        if (!source) {
            return undefined;
        }

        if (this.#peers.has(source)) {
            return resolve_sender(this.#peers.get(source));
        }

        if (source === this.#target_window && source !== window) {
            return resolve_sender(this.#target_sender);
        }

        return undefined;
    };

    #ensure_message_listener = () => {
        if (this.#message_listener) return;

        this.#message_listener = (event: MessageEvent) => {
            const data = event.data;
            if (!is_envelope(data) || data.kind !== "ONE_OFF_REQ") {
                return;
            }

            const sender = this.#resolve_sender(event);
            if (!sender) {
                return;
            }

            const source = event.source as Window;
            const reply_origin = event.origin === "null" ? "*" : event.origin;

            this.deliver(data.payload, sender).then((payload) => {
                // always answer, even with nothing. the sender is holding a promise open so silence would leak a listener
                const res: MessageEnvelope = {
                    __protocol: protocol_key,
                    kind: "ONE_OFF_RES",
                    id: data.id,
                    payload
                };

                try {
                    source.postMessage(res, reply_origin);
                } catch {
                    // the window went away mid-flight
                }
            });
        };

        window.addEventListener("message", this.#message_listener);
    };

    #ensure_connect_listener = () => {
        if (this.#connect_listener) return;

        this.#connect_listener = (event: MessageEvent) => {
            const data = event.data;
            if (!is_envelope(data) || data.kind !== "CONNECT") {
                return;
            }

            if (!event.ports || event.ports.length === 0) {
                return;
            }

            if (!this.#resolve_sender(event)) {
                return;
            }

            const subscribers = Array.from(this.#connect_handlers).filter(
                ({ name }) => !name || name === data.name
            );
            if (subscribers.length === 0) {
                return;
            }

            const channel = wrap_message_port(event.ports[0]!, data.name);
            subscribers.forEach(({ handler }) => handler(channel));
        };

        window.addEventListener("message", this.#connect_listener);
    };

    deliver = async <Rx>(payload: unknown, sender: SenderInfo): Promise<Rx | undefined> => {
        const responses = await Promise.all(
            Array.from(this.#message_handlers).map(async (handler) => {
                try {
                    return await handler(payload, sender);
                } catch (error) {
                    console.error("Error in message handler:", payload, error);
                    return undefined;
                }
            })
        );

        // first handler with something to say answers, the rest just observed
        return responses.find((response) => response !== undefined) as Rx | undefined;
    };

    send = async <Tx, Rx>(action: Tx): Promise<Rx> => {
        const id = Math.random().toString(36).substring(2) + Date.now().toString(36);

        return new Promise<Rx>((resolve) => {
            let timer: ReturnType<typeof setTimeout>;

            const settle = (value: Rx) => {
                clearTimeout(timer);
                window.removeEventListener("message", on_message);
                resolve(value);
            };

            const on_message = (event: MessageEvent) => {
                const data = event.data;
                if (
                    is_envelope(data) &&
                    data.kind === "ONE_OFF_RES" &&
                    data.id === id &&
                    event.source === this.#target_window
                ) {
                    settle(data.payload as Rx);
                }
            };

            window.addEventListener("message", on_message);

            timer = setTimeout(() => {
                console.warn("Timed out waiting for a reply to:", action);
                settle(undefined as Rx);
            }, this.#send_timeout_ms);

            const req: MessageEnvelope = {
                __protocol: protocol_key,
                kind: "ONE_OFF_REQ",
                id,
                payload: action
            };

            this.#target_window.postMessage(req, this.#target_origin);
        });
    };

    listen = <Rx, Tx>(
        handler: (event: Rx, sender: SenderInfo) => Promise<Tx | void>
    ): (() => void) => {
        this.#ensure_message_listener();
        this.#message_handlers.add(handler as (event: any, sender: SenderInfo) => Promise<any>);

        return () => {
            this.#message_handlers.delete(
                handler as (event: any, sender: SenderInfo) => Promise<any>
            );
        };
    };

    connect = <Tx, Rx>(channel_name: string): HVRMessageChannel<Tx, Rx> => {
        const channel = new MessageChannel();

        const signal: MessageEnvelope = {
            __protocol: protocol_key,
            kind: "CONNECT",
            name: channel_name
        };

        this.#target_window.postMessage(signal, this.#target_origin, [channel.port2]);

        return wrap_message_port<Tx, Rx>(channel.port1, channel_name);
    };

    on_connect = <Tx, Rx>(
        channel_name: string | undefined,
        handler: (channel: HVRMessageChannel<Rx, Tx>) => void
    ): (() => void) => {
        this.#ensure_connect_listener();

        const entry = {
            name: channel_name,
            handler: handler as (channel: HVRMessageChannel<any, any>) => void
        };
        this.#connect_handlers.add(entry);

        return () => {
            this.#connect_handlers.delete(entry);
        };
    };
}
