import type { Hand } from "../../input/hands";

// which hand is currently holding each engine object
// grabbable arbitration is per-instance
const holders = new Map<string, Hand>();

export const set_object_holder = (object_id: string, hand: Hand | null) => {
    if (hand) {
        holders.set(object_id, hand);
    } else {
        holders.delete(object_id);
    }
};

export const clear_object_holder = (object_id: string, hand: Hand) => {
    if (holders.get(object_id) === hand) holders.delete(object_id);
};

export const get_object_holder = (object_id: string): Hand | null =>
    holders.get(object_id) ?? null;

export const is_object_held = (object_id: string): boolean => holders.has(object_id);
