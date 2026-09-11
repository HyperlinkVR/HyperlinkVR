import { create } from "zustand";

import type { Appearance } from "../net/presence_protocol";

// how remote players look. their poses change every frame so live outside react, in pose_buffer
interface PresenceState {
    appearances: Record<string, Appearance>;

    set_appearance: (peer_id: string, appearance: Appearance) => void;
    retain: (peer_ids: Set<string>) => void;
    clear: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
    appearances: {},

    set_appearance: (peer_id, appearance) =>
        set((state) => ({ appearances: { ...state.appearances, [peer_id]: appearance } })),

    // drop anyone who's left
    retain: (peer_ids) =>
        set((state) => {
            const kept = Object.fromEntries(
                Object.entries(state.appearances).filter(([peer_id]) => peer_ids.has(peer_id))
            );
            return Object.keys(kept).length === Object.keys(state.appearances).length ? state : { appearances: kept };
        }),

    clear: () => set({ appearances: {} })
}));
