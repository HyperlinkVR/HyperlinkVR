import type { PeerID } from "@hyperlinkvr/core";

// who sits where (seat id → player id). sitting by input takes the seat straight away and asks the
// host, which confirms or answers with the real occupant (the loser stands up). the SDK's sit/stand
// are replicated commands, applied in order everywhere. solo: just a local table.

export type SeatRequest = { type: "claim" | "release"; seat_id: string };
export type SeatMessage = { type: "occupant"; seat_id: string; player: PeerID | null };

const occupants = new Map<string, PeerID>();
const listeners = new Set<(seat_id: string) => void>();

// client: ask the host. host: tell everyone. neither outside a shared room
let send_to_host: ((request: SeatRequest) => void) | null = null;
let broadcast: ((seat_id: string, player: PeerID | null) => void) | null = null;

export const set_seat_transport = (transport: {
    send_to_host?: (request: SeatRequest) => void;
    broadcast?: (seat_id: string, player: PeerID | null) => void;
} | null) => {
    send_to_host = transport?.send_to_host ?? null;
    broadcast = transport?.broadcast ?? null;
};

export const get_seat_occupant = (seat_id: string): PeerID | null => occupants.get(seat_id) ?? null;

export const on_seat_change = (listener: (seat_id: string) => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const set_seat_occupant = (seat_id: string, player: PeerID | null) => {
    if ((occupants.get(seat_id) ?? null) === player) {
        return;
    }
    if (player) {
        occupants.set(seat_id, player);
    } else {
        occupants.delete(seat_id);
    }
    for (const listener of listeners) {
        listener(seat_id);
    }
};

// the local player wants to sit (by input). false if someone else has the seat
export const request_seat = (seat_id: string, self: PeerID): boolean => {
    const current = get_seat_occupant(seat_id);
    if (current && current !== self) {
        return false;
    }
    set_seat_occupant(seat_id, self);
    if (broadcast) {
        broadcast(seat_id, self);
    } else {
        send_to_host?.({ type: "claim", seat_id });
    }
    return true;
};

// the local player got up (by input)
export const leave_seat = (seat_id: string, self: PeerID) => {
    if (get_seat_occupant(seat_id) !== self) {
        return;
    }
    set_seat_occupant(seat_id, null);
    if (broadcast) {
        broadcast(seat_id, null);
    } else {
        send_to_host?.({ type: "release", seat_id });
    }
};

// host: a client's claim or release. a refused claim is answered with the real occupant, which makes
// the claimant (who sat optimistically) stand back up
export const host_handle_seat_request = (from: PeerID, request: SeatRequest) => {
    const current = get_seat_occupant(request.seat_id);
    if (request.type === "claim") {
        if (!current || current === from) {
            set_seat_occupant(request.seat_id, from);
        }
        broadcast?.(request.seat_id, get_seat_occupant(request.seat_id));
    } else if (current === from) {
        set_seat_occupant(request.seat_id, null);
        broadcast?.(request.seat_id, null);
    }
};

// host: a player left, so their seats are free
export const host_release_player_seats = (player: PeerID) => {
    for (const [seat_id, occupant] of [...occupants]) {
        if (occupant === player) {
            set_seat_occupant(seat_id, null);
            broadcast?.(seat_id, null);
        }
    }
};

export const get_seat_table = (): [string, PeerID][] => [...occupants];

export const replace_seat_table = (table: [string, PeerID][]) => {
    const next = new Map(table);
    for (const seat_id of [...occupants.keys()]) {
        if (!next.has(seat_id)) set_seat_occupant(seat_id, null);
    }
    for (const [seat_id, player] of next) {
        set_seat_occupant(seat_id, player);
    }
};

export const clear_seats = () => replace_seat_table([]);
