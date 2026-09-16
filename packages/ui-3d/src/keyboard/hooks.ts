import type { VanillaInput } from "@react-three/uikit";
import { useCallback, useRef } from "react";

import { useKeyboardStore } from "./store";


// low level access
export const useKeyboardTarget = () => {
    const open = useKeyboardStore((s) => s.open);
    const close = useKeyboardStore((s) => s.close);
    return { open, close };
};


interface KeyboardInputOptions {
    ref?: React.RefObject<VanillaInput | null> | null;
    onFocusChange?: (focused: boolean) => void;
}

// high level access for inputs that want to automatically open the keyboard when focused, and close it when blurred
export const useKeyboardInput = ({ ref, onFocusChange }: KeyboardInputOptions = {}) => {
    const internal = useRef<VanillaInput | null>(null);
    const { open, close } = useKeyboardTarget();

    const set_ref = useCallback(
        (instance: VanillaInput | null) => {
            internal.current = instance;
            // suppress the OS on-screen keyboard
            if (instance) instance.element.inputMode = "none";
            if (ref) ref.current = instance;
        },
        [ref]
    );

    const handle_focus_change = useCallback(
        (focused: boolean) => {
            const input = internal.current;
            if (input) {
                if (focused) open(input.element);
                else close(input.element);
            }
            onFocusChange?.(focused);
        },
        [open, close, onFocusChange]
    );

    return { ref: set_ref, onFocusChange: handle_focus_change };
};
