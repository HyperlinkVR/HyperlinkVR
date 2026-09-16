import type { VanillaInput } from "@react-three/uikit";
import { useCallback, useEffect, useRef } from "react";

import type { KeyboardTarget } from "./store";
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

    // unmount cleanup can still see the element after react has already called the ref callback with null
    const element = useRef<KeyboardTarget | null>(null);

    const { open, close } = useKeyboardTarget();

    const set_ref = useCallback(
        (instance: VanillaInput | null) => {
            internal.current = instance;
            if (instance) {
                // suppress the OS on-screen keyboard
                instance.element.inputMode = "none";
                element.current = instance.element;
            }
            if (ref) ref.current = instance;
        },
        [ref]
    );

    // close the keyboard when the input is unmounted
    useEffect(() => () => close(element.current), [close]);

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
