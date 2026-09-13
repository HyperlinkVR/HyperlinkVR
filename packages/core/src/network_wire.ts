import type { Delivery, Payload, PeerID, PeerInfo, RoomCloseReason, SendTarget } from "./network";

// client -> server
export type ClientFrame =
    | { t: "msg"; target: SendTarget; channel: string; delivery: Delivery; payload: Payload }
    | { t: "leave" };

// server -> client
export type ServerFrame =
    | { t: "welcome"; self: PeerInfo; peers: PeerInfo[]; host: PeerID }
    | { t: "peer-joined"; peer: PeerInfo }
    | { t: "peer-left"; peer_id: PeerID }
    | { t: "host-changed"; host: PeerID }
    | { t: "msg"; from: PeerID; channel: string; delivery: Delivery; payload: Payload }
    | { t: "closed"; reason: RoomCloseReason };
