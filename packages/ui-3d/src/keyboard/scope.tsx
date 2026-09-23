import { createContext, useContext, useEffect, type ReactNode } from "react";

import { useKeyboardStore } from "./store";


const KeyboardScopeContext = createContext<string | null>(null);

export const useKeyboardScope = () => useContext(KeyboardScopeContext);

// wrap a surface (e.g. the watch UI) so its inputs share a scope. pass active={false} when the surface is dismissed but still mounted to close its keyboard
export const KeyboardScope = ({
    name,
    active = true,
    children
}: {
    name: string;
    active?: boolean;
    children: ReactNode;
}) => {
    useEffect(() => {
        if (!active) useKeyboardStore.getState().close_scope(name);
    }, [name, active]);

    useEffect(() => () => useKeyboardStore.getState().close_scope(name), [name]);

    return <KeyboardScopeContext.Provider value={name}>{children}</KeyboardScopeContext.Provider>;
};
