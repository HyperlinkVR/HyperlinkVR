import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";



import { screen_titles, ScreenArguments, ScreenName } from "../screens";


interface NavStackEntry {
    name: ScreenName;
    args: ScreenArguments;
}

interface NavStateContextType {
    backwards: NavStackEntry[];
    forwards: NavStackEntry[];
    current: ScreenName | null;
    current_args: ScreenArguments;
    change_screen: (screen_name: ScreenName, args?: ScreenArguments) => void;
    name_to_title: (screen_name: ScreenName | null) => string;
    current_title: string;
    change_title: (title: string) => void;
    replace_args: (args: ScreenArguments) => void;
    back: () => void;
    forward: () => void;

    counter: number;

    set_detach?: (detached: boolean) => void;
    detached?: boolean;
    detachable?: boolean;
    request_close?: () => void;

    begin_modal: (
        screen_name: ScreenName,
        args?: ScreenArguments,
        resolve?: (result: any) => void,
        dismiss_value?: unknown
    ) => void;
    resolve_modal: (result?: unknown) => void;
}

const NavStateContext = createContext<NavStateContextType | null>(null);

export const NavStateProvider = ({ children, options }: { children: React.ReactNode, options?: { detachable?: boolean, set_detach?: (detached: boolean) => void, detached?: boolean, request_close?: () => void } }) => {
    const [backwards, setBackwards] = useState<NavStackEntry[]>([]);
    const [forwards, setForwards] = useState<NavStackEntry[]>([]);

    const [current_screen, setCurrentScreen] = useState<ScreenName | null>("home");
    const [current_args, setCurrentArgs] = useState<ScreenArguments>({});
    const [current_title, setCurrentTitle] = useState<string>(screen_titles[current_screen!] || current_screen!);

    const [counter, setCounter] = useState<number>(0);

    const name_to_title = useCallback((screen_name: ScreenName | null) => {
        if (!screen_name) {
            return ":(";
        }

        return screen_titles[screen_name] || screen_name;
    }, []);

    useEffect(() => {
        setCurrentTitle(name_to_title(current_screen));
    }, [current_screen, name_to_title]);

    const modal_ref = useRef<{
        resolve: (value: any) => void;
        dismiss_value: unknown;
        settled: boolean;
        close_on_resolve: boolean;
    } | null>(null);

    const settle_pending_modal = useCallback((value?: unknown) => {
        const current_modal = modal_ref.current;
        if (!current_modal || current_modal.settled) return;
        current_modal.settled = true;
        modal_ref.current = null;
        current_modal.resolve(value);
    }, []);

    const resolve_modal = useCallback(
        (result?: unknown) => {
            const current_modal = modal_ref.current;
            if (!current_modal || current_modal.settled) return;

            const should_close = current_modal.close_on_resolve ?? true;
            settle_pending_modal(result);

            if (should_close) {
                options?.request_close?.();
            }
        },
        [settle_pending_modal, options?.request_close]
    );

    const apply_screen_change = useCallback(
        (screen_name: ScreenName, args: ScreenArguments = {}) => {
            if (screen_name === current_screen && JSON.stringify(args) === JSON.stringify(current_args)) {
                return;
            }

            setBackwards((prev) =>
                current_screen
                    ? [...prev, { name: current_screen, args: current_args }]
                    : prev
            );
            setForwards([]);

            setCurrentScreen(screen_name);
            setCurrentArgs(args);

            setCounter((prev) => prev + 1);
        },
        [current_screen, current_args]
    );

    const change_screen = useCallback(
        (screen_name: ScreenName, args: ScreenArguments = {}) => {
            if (screen_name === current_screen && JSON.stringify(args) === JSON.stringify(current_args)) {
                return;
            }

            // modal dismissed
            if (modal_ref.current && !modal_ref.current.settled) {
                settle_pending_modal(modal_ref.current.dismiss_value);
            }

            apply_screen_change(screen_name, args);
        },
        [current_screen, current_args, settle_pending_modal, apply_screen_change]
    );

    const back = useCallback(
        () => {
            if (backwards.length === 0) {
                return;
            }

            // modal dismissed
            if (modal_ref.current && !modal_ref.current.settled) {
                settle_pending_modal(modal_ref.current.dismiss_value);
            }

            const new_current = backwards[backwards.length - 1]!;
            setBackwards((prev) => (prev ? prev.slice(0, -1) : []));
            setForwards((prev) => (prev ? [...prev, { name: current_screen!, args: current_args }] : [{ name: current_screen!, args: current_args }]));

            setCurrentScreen(new_current.name);
            setCurrentArgs(new_current.args);

            setCounter((prev) => prev + 1);
        }, [backwards, current_screen, current_args, settle_pending_modal]
    );

    const forward = useCallback(() => {
        if (forwards.length === 0) {
            return;
        }

        const new_current = forwards[forwards.length - 1]!;
        setForwards((prev) => (prev ? prev.slice(0, -1) : []));
        setBackwards((prev) => (prev ? [...prev, { name: current_screen!, args: current_args }] : [{ name: current_screen!, args: current_args }]));

        setCurrentScreen(new_current.name);
        setCurrentArgs(new_current.args);

        setCounter((prev) => prev + 1);
    }, [forwards, current_screen, current_args]);

    const begin_modal = useCallback(
        (
            screen_name: ScreenName,
            args: ScreenArguments = {},
            resolve?: (result: any) => void,
            dismiss_value: unknown = undefined,
            close_on_resolve = true
        ) => {
            if (modal_ref.current && !modal_ref.current.settled) {
                settle_pending_modal(modal_ref.current.dismiss_value);
            }

            modal_ref.current = resolve
                ? {
                      resolve,
                      dismiss_value,
                      settled: false,
                      close_on_resolve
                  }
                : null;

            apply_screen_change(screen_name, args);
        },
        [change_screen, settle_pending_modal]
    );

    useEffect(() => {
        return () => {
            if (modal_ref.current && !modal_ref.current.settled) {
                settle_pending_modal(modal_ref.current.dismiss_value);
            }
        };
    }, [settle_pending_modal]);

    return (
        <NavStateContext.Provider value={{
            backwards,
            forwards,
            current: current_screen,
            current_args,
            replace_args: setCurrentArgs,
            change_screen,
            back,
            forward,
            name_to_title,
            current_title,
            change_title:
            setCurrentTitle,
            counter,
            begin_modal,
            resolve_modal,
            ...options}}
        >
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
