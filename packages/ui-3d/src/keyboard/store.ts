import { create } from "zustand";


export type KeyboardTarget = HTMLInputElement | HTMLTextAreaElement;

interface KeyboardState {
    target: KeyboardTarget | null;
    // the surface that owns the current target (e.g. "watch"), so a surface can close only its own
    scope: string | null;
    is_open: boolean;

    open: (target: KeyboardTarget, scope?: string | null) => void;
    close: (target?: KeyboardTarget | null) => void;
    // close the keyboard if the active target belongs to `scope` (used when a hidden-but-mounted
    // surface like the watch is dismissed and no blur/unmount fires on its own)
    close_scope: (scope: string) => void;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
    target: null,
    scope: null,
    is_open: false,

    open: (target, scope = null) => set({ target, scope, is_open: true }),

    close: (target) => {
        // ignore a blur from an input that is no longer the active target (focus already moved on)
        if (target != null && get().target !== target) return;
        set({ target: null, scope: null, is_open: false });
    },

    close_scope: (scope) => {
        if (get().scope !== scope) return;
        // blur through the element so uikit's own focus state stays in sync (its blur listener
        // fires onFocusChange(false), routing back through close()); the set() is a safety net
        // for a target opened manually without the focus hook.
        get().target?.blur();
        set({ target: null, scope: null, is_open: false });
    }
}));
