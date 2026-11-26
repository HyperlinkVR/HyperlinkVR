import { create } from "zustand";

// how far the local player has arrived (players.on_spawn / on_enter). `spawned`: they have a placeable
// body in this world. `entered`: the host app's play overlay is gone; it stays true across worlds, so
// arriving somewhere new mid-session enters as soon as you spawn. avatars are only sent once both hold.

interface PlayerPresenceState {
    entered: boolean;
    spawned: boolean;
    set_entered: (entered: boolean) => void;
    set_spawned: (spawned: boolean) => void;
}

export const usePlayerPresenceStore = create<PlayerPresenceState>((set) => ({
    entered: false,
    spawned: false,
    set_entered: (entered) => set({ entered }),
    set_spawned: (spawned) => set({ spawned })
}));
