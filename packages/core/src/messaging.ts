import type { ActionMessage, EventMessage, ReplyMessage } from "@hyperlinkvr/types";

export interface MessageChannel<Tx = ActionMessage, Rx = EventMessage> {
    name: string;

    send(payload: Tx): Promise<void>;

    listen(handler: (payload: Rx) => void): void;

    on_disconnect(handler: () => void): () => void;

    disconnect(): void;
}

export interface SenderInfo {
    origin?: string;
    url?: string;
    tab_id?: number;
}

export interface MessageEngine {
    // one off messages
    send<Tx = ActionMessage, Rx = void | ReplyMessage>(action: Tx): Promise<Rx>;

    // returns a function to remove the listener
    listen<Rx = EventMessage, Tx = ReplyMessage>(
        handler: (event: Rx, sender: SenderInfo) => Promise<Tx | void>
    ): () => void;

    // long-lived connections
    connect<Tx, Rx>(
        channel_name: string
    ): MessageChannel<Tx, Rx>;

    // returns a function to remove the listener
    // pass channel_name=undefined to bind to all channels
    on_connect<Tx, Rx>(
        channel_name: string | undefined,
        handler: (channel: MessageChannel<Rx, Tx>) => void
    ): () => void;
}
