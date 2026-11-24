import { create } from "zustand";

interface WorldLoadingStateStore {
    loading: boolean;
    world_ready: boolean;
    timed_out: boolean;
    // shared client only: the world we hold is the host's (snapshot hydrated / host's load finished)
    // and has loaded. world_ready alone can be stale from the page running the world solo before the
    // room joined, so a client must not spawn off it
    synced_with_host: boolean;
    set_loading: (loading: boolean) => void;
    set_world_ready: (world_ready: boolean) => void;
    set_timed_out: (timed_out: boolean) => void;
    set_synced_with_host: (synced: boolean) => void;
    reset_for_new_document: () => void;
}

export const useWorldLoadingStateStore = create<WorldLoadingStateStore>((set) => ({
    loading: false,
    world_ready: false,
    timed_out: false,
    synced_with_host: false,
    set_loading: (loading) => set({ loading }),
    set_world_ready: (world_ready) => set({ world_ready }),
    set_timed_out: (timed_out) => set({ timed_out }),
    set_synced_with_host: (synced_with_host) => set({ synced_with_host }),
    reset_for_new_document: () => set({ world_ready: false, timed_out: false, synced_with_host: false })
}));
