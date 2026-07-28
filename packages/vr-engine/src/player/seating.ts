import { useSyncExternalStore } from "react";
import type { Object3D } from "three";

export interface ActiveSeat {
    anchor: Object3D;                        // where the player's bum goes :O
    yaw_range_rad: [number, number] | null;  // null = free look
    seat_id: string;                         // owning seat, so a second seat can't eject you
}

let active_seat: ActiveSeat | null = null;
const listeners = new Set<() => void>();

const emit = () => {
    for (const listener of listeners) listener();
};

export const get_active_seat = (): ActiveSeat | null => active_seat;

export const is_seated_on = (seat_id: string): boolean =>
    active_seat?.seat_id === seat_id;

export const sit_on = (seat: ActiveSeat) => {
    active_seat = seat;
    emit();
};

export const stand_up = (seat_id?: string) => {
    // only the occupying seat may release you
    if (seat_id !== undefined && active_seat?.seat_id !== seat_id) return;
    active_seat = null;
    emit();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const get_seated_snapshot = () => active_seat !== null;

export const useIsSeated = (): boolean => useSyncExternalStore(subscribe, get_seated_snapshot, get_seated_snapshot);
