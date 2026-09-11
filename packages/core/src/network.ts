export type PeerID = string;

export interface RoomKey {
    world: string;
    instance: string;
}

// claimed, not verified
export interface PeerHello {
    username: string | null;
    display_name?: string;
    // TODO: transmit other details like avatar etc
}

export interface PeerInfo extends PeerHello {
    id: PeerID;
    // join order, not time (for comparison)
    joined_at: number;
}

// reliable is ordered per (sender, channel). unreliable may be dropped, reordered or coalesced
export type Delivery = "reliable" | "unreliable";

export type Payload = string | Uint8Array;

export type SendTarget = { peer: PeerID } | "others" | "host";

export interface IncomingMessage {
    from: PeerID;
    channel: string;
    payload: Payload;
    delivery: Delivery;
}

export type RoomCloseReason = "left" | "connection-lost" | "rejected" | "room-closed";

export type RoomEvent =
    | { type: "peer-joined"; peer: PeerInfo }
    | { type: "peer-left"; peer_id: PeerID }
    | { type: "host-changed"; host: PeerID }
    | { type: "closed"; reason: RoomCloseReason };

export interface RoomCapabilities {
    // false if unreliable sends are actually carried reliably (e.g. websocket)
    unreliable: boolean;
    max_payload_bytes?: number;
}

export interface NetworkRoom {
    readonly key: RoomKey;
    readonly self: PeerInfo;
    readonly capabilities: RoomCapabilities;

    // includes self
    peers(): PeerInfo[];

    // elected by the carrier, never the engine
    host(): PeerID;

    // never loops back to self
    send(target: SendTarget, channel: string, payload: Payload, delivery?: Delivery): void;

    // returns a function to remove the listener
    on_message(handler: (message: IncomingMessage) => void): () => void;

    // returns a function to remove the listener
    on_event(handler: (event: RoomEvent) => void): () => void;

    leave(): void;
}

export interface NetworkEngine {
    // resolves once membership and host are known
    join(key: RoomKey, hello: PeerHello): Promise<NetworkRoom>;
}
