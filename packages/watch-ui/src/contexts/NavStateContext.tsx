import type {ScreenName} from "../screens";
import {createContext, useCallback, useContext, useState} from "react";

interface NavStateContextType {
    backwards: ScreenName[];
    forwards: ScreenName[];
    current: ScreenName | null;
    change_screen: (screen_name: ScreenName) => void;
    name_to_title: (screen_name: ScreenName | null) => string;
    back: () => void;
    forward: () => void;

    set_detach?: (detached: boolean) => void;
    detached?: boolean;
    detachable?: boolean;
}

const screen_titles: Record<ScreenName, string> = {
    home: "Home",
    settings: "Settings"
} as const;

const NavStateContext = createContext<NavStateContextType | null>(null);

export const NavStateProvider = ({ children, options }: { children: React.ReactNode, options?: { detachable?: boolean, set_detach?: (detached: boolean) => void, detached?: boolean } }) => {
    const [backwards, setBackwards] = useState<ScreenName[]>([]);
    const [forwards, setForwards] = useState<ScreenName[]>([]);
    const [current, setCurrent] = useState<ScreenName | null>("home");

    const change_screen = useCallback(
        (screen_name: ScreenName) => {
            if (screen_name === current) {
                return;
            }

            setBackwards((prev) => (current ? [...prev, current] : prev));
            setForwards([]);
            setCurrent(screen_name);
        },
        [current]
    );

    const back = useCallback(() => {
        if (backwards.length === 0) {
            return;
        }

        const new_current = backwards[backwards.length - 1]!;
        setBackwards((prev) => (prev ? prev.slice(0, -1) : []));
        setForwards((prev) => (prev ? [...prev, current!] : [current!]));
        setCurrent(new_current);
    }, [backwards, current]);

    const forward = useCallback(() => {
        if (forwards.length === 0) {
            return;
        }

        const new_current = forwards[forwards.length - 1]!;
        setForwards((prev) => (prev ? prev.slice(0, -1) : []));
        setBackwards((prev) => (prev ? [...prev, current!] : [current!]));
        setCurrent(new_current);
    }, [forwards, current]);

    const name_to_title = useCallback((screen_name: ScreenName | null) => {
        if (!screen_name) {
            return ":(";
        }

        return screen_titles[screen_name] || screen_name;
    }, []);

    return (
        <NavStateContext.Provider value={{ backwards, forwards, current, change_screen, back, forward, name_to_title, ...options }}>
            {children}
        </NavStateContext.Provider>
    );
};

export const useNavState = () => {
    const context = useContext(NavStateContext);
    if (!context) {
        throw new Error("useNavState must be used within a NavStateProvider");
    }
    return context;
}
