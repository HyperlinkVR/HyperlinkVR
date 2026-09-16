import { useEffect, useRef } from "react";
import { create } from "zustand";

// scheme-neutral "system UI" input intents
// somewhat of a workaround of the disjointed input system between xr and flat, but works fine

interface SystemInputStore {
    // momentary button to show quick menu while held
    quick_menu_held: boolean;
    set_quick_menu_held: (held: boolean) => void;

    // one shot button to detach/reattach the watch ui when open
    watch_detach_nonce: number;
    fire_watch_detach: () => void;
}

export const useSystemInputStore = create<SystemInputStore>((set) => ({
    quick_menu_held: false,
    set_quick_menu_held: (held) =>
        set((state) => (state.quick_menu_held === held ? state : { quick_menu_held: held })),

    watch_detach_nonce: 0,
    fire_watch_detach: () => set((state) => ({ watch_detach_nonce: state.watch_detach_nonce + 1 }))
}));

export const useQuickMenuHeld = (): boolean => useSystemInputStore((state) => state.quick_menu_held);

export const useWatchDetachShortcut = (on_fire: () => void) => {
    const handler = useRef(on_fire);
    handler.current = on_fire;

    useEffect(() => {
        let previous = useSystemInputStore.getState().watch_detach_nonce;
        return useSystemInputStore.subscribe((state) => {
            if (state.watch_detach_nonce !== previous) {
                previous = state.watch_detach_nonce;
                handler.current();
            }
        });
    }, []);
};
