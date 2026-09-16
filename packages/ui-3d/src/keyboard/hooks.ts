import type { VanillaInput } from "@react-three/uikit";
import { useCallback, useEffect, useRef } from "react";

import { useKeyboardScope } from "./scope";
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

    // override the surface scope, defaults to the nearest <KeyboardScope>
    scope?: string | null;
}

// high level access for inputs that want to automatically open the keyboard when focused, and close it when blurred
export const useKeyboardInput = ({ ref, onFocusChange, scope }: KeyboardInputOptions = {}) => {
    const internal = useRef<VanillaInput | null>(null);

    // unmount cleanup can still see the element after react has already called the ref callback with null
    const element = useRef<KeyboardTarget | null>(null);

    const context_scope = useKeyboardScope();
    const resolved_scope = scope ?? context_scope;

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
                if (focused) open(input.element, resolved_scope);
                else close(input.element);
            }
            onFocusChange?.(focused);
        },
        [open, close, onFocusChange, resolved_scope]
    );

    return { ref: set_ref, onFocusChange: handle_focus_change };
};
