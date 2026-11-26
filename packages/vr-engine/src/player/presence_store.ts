import { create } from "zustand";

// where the local player is in arriving, as the world sees it (players.on_join / on_spawn / on_enter).
// `entered`: nothing stands between them and the game: the host app has dismissed its "play" overlay
// (play clicked / headset on). it stays true across worlds within a session, so arriving somewhere new
// via the watch counts as entered as soon as you spawn. `spawned`: they have a placeable body in the
// current world. remote avatars are only drawn (and only collide) once their player has spawned
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
