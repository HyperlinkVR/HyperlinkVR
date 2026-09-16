import { create } from "zustand";


export type KeyboardTarget = HTMLInputElement | HTMLTextAreaElement;

interface KeyboardState {
    target: KeyboardTarget | null;
    is_open: boolean;

    open: (target: KeyboardTarget) => void;
    close: (target?: KeyboardTarget | null) => void;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
    target: null,
    is_open: false,

    open: (target) => set({ target, is_open: true }),

    close: (target) => {
        // ignore a blur from an input that is no longer the active target (focus already moved on)
        if (target != null && get().target !== target) return;
        set({ target: null, is_open: false });
    }
}));
