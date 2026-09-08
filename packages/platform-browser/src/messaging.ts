import type { MessageChannel, MessageEngine, SenderInfo } from "@hyperlinkvr/core";

const protocol_key = "__HYPERLINKVR__";

// signalling envelope
type MessageEnvelope =
    | { __protocol: typeof protocol_key; kind: "ONE_OFF_REQ"; id: string; payload: any }
    | { __protocol: typeof protocol_key; kind: "ONE_OFF_RES"; id: string; payload: any }
    | { __protocol: typeof protocol_key; kind: "CONNECT"; name: string }
    | { __protocol: typeof protocol_key; kind: "PORT_DISCONNECT" };

const wrap_message_port = <Tx, Rx>(
    port: MessagePort,
    name: string
): MessageChannel<Tx, Rx> => {
    const disconnect_handlers = new Set<() => void>();
    const message_handlers = new Set<(payload: Rx) => void>();
    let is_disconnected = false;

    const trigger_disconnect = () => {
        if (is_disconnected) return;
        is_disconnected = true;

        disconnect_handlers.forEach((handler) => handler());
        disconnect_handlers.clear();
        message_handlers.clear();

        try {
            port.close();
        } catch {
            // ignore
        }
    };

    port.start();

    port.onmessage = (event: MessageEvent) => {
        if (is_disconnected) return;

        const data = event.data;
        if (data && typeof data === "object" && data.__protocol === protocol_key) {
            if (data.kind === "PORT_DISCONNECT") {
                trigger_disconnect();
                return;
            }
        }

        message_handlers.forEach((handler) => handler(data as Rx));
    };

    const on_unload = () => {
        try {
            port.postMessage({ __protocol: protocol_key, kind: "PORT_DISCONNECT" });
        } catch {
            // ignore
        }
        trigger_disconnect();
    };

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
                window.removeEventListener("pagehide", on_unload);
            }
        },
    };
};

export class BrowserMessageEngine implements MessageEngine {
    readonly #target_window: Window;
    readonly #target_origin: string;

    constructor(
        target_window: Window = window.parent,
        target_origin: string = "*"
    ) {
        this.#target_window = target_window;
        this.#target_origin = target_origin;
    }

    send = async <Tx, Rx>(action: Tx): Promise<Rx> => {
        const id = Math.random().toString(36).substring(2) + Date.now().toString(36);

        return new Promise<Rx>((resolve) => {
            const on_message = (event: MessageEvent) => {
                const data = event.data as MessageEnvelope;
                if (
                    data &&
                    typeof data === "object" &&
                    data.__protocol === protocol_key &&
                    data.kind === "ONE_OFF_RES" &&
                    data.id === id
                ) {
                    window.removeEventListener("message", on_message);
                    resolve(data.payload as Rx);
                }
            };

            window.addEventListener("message", on_message);

            const req: MessageEnvelope = {
                __protocol: protocol_key,
                kind: "ONE_OFF_REQ",
                id,
                payload: action,
            };

            this.#target_window.postMessage(req, this.#target_origin);
        });
    };

    listen = <Rx, Tx>(
        handler: (event: Rx, sender: SenderInfo) => Promise<Tx | void>
    ): (() => void) => {
        const listener = async (event: MessageEvent) => {
            const data = event.data as MessageEnvelope;
            if (
                data &&
                typeof data === "object" &&
                data.__protocol === protocol_key &&
                data.kind === "ONE_OFF_REQ"
            ) {
                const sender: SenderInfo = {
                    origin: event.origin,
                    url: event.origin,
                };

                const response = await handler(data.payload as Rx, sender);

                if (response !== undefined && event.source) {
                    const res: MessageEnvelope = {
                        __protocol: protocol_key,
                        kind: "ONE_OFF_RES",
                        id: data.id,
                        payload: response,
                    };
                    const reply_origin = event.origin === "null" ? "*" : event.origin;
                    (event.source as Window).postMessage(res, reply_origin);
                }
            }
        };

        window.addEventListener("message", listener);
        return () => window.removeEventListener("message", listener);
    };

    connect = <Tx, Rx>(channel_name: string): MessageChannel<Tx, Rx> => {
        const channel = new MessageChannel();

        const signal: MessageEnvelope = {
            __protocol: protocol_key,
            kind: "CONNECT",
            name: channel_name,
        };

        this.#target_window.postMessage(signal, this.#target_origin, [channel.port2]);

        return wrap_message_port<Tx, Rx>(channel.port1, channel_name);
    };

    on_connect = <Tx, Rx>(
        channel_name: string | undefined,
        handler: (channel: MessageChannel<Rx, Tx>) => void
    ): (() => void) => {
        const listener = (event: MessageEvent) => {
            const data = event.data as MessageEnvelope;
            if (
                data &&
                typeof data === "object" &&
                data.__protocol === protocol_key &&
                data.kind === "CONNECT" &&
                event.ports &&
                event.ports.length > 0
            ) {
                if (!channel_name || data.name === channel_name) {
                    const transferred_port = event.ports[0]!;
                    const channel = wrap_message_port<Rx, Tx>(transferred_port, data.name);
                    handler(channel);
                }
            }
        };

        window.addEventListener("message", listener);
        return () => window.removeEventListener("message", listener);
    };
}
