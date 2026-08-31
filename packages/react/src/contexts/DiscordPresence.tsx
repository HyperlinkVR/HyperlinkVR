import { DiscordRPCActivity, DiscordRPCEngine } from "@hyperlinkvr/core";
import { createContext, useCallback, useContext, useEffect, useState } from "react";



import { useSetting } from "../hooks";
import { useDiscordRPCEngineOptional } from "./engines";


type DiscordPresenceContextType = Omit<DiscordRPCEngine, "connect" | "disconnect" | "request_permission" | "setup">;
const DiscordPresenceContext = createContext<DiscordPresenceContextType | null>(null);

export const DiscordPresenceProvider = ({children, initial_activity}: {children: React.ReactNode, initial_activity?: DiscordRPCActivity}) => {
    const engine = useDiscordRPCEngineOptional() || {
        is_connected: async () => false,
        set_activity: async () => {},
        clear_activity: async () => {},
        has_permission: async () => false,
        connect: async () => {},
        disconnect: async () => {},
        _is_noop: true
    };
    const [enabled] = useSetting("discord_rpc");

    const [current_activity, setCurrentActivity] = useState<DiscordRPCActivity | null>(initial_activity || null);

    const send_current_activity = async () => {
        if (!await engine.is_connected()) {
            return;
        }

        if (current_activity) {
            return engine.set_activity(current_activity);
        } else {
            return engine.clear_activity();
        }
    }

    const set_activity = useCallback(
        async (activity: DiscordRPCActivity) => {
            setCurrentActivity(activity);

            if (!await engine.is_connected()) {
                return;
            }

            return engine.set_activity(activity);
        },
        [engine]
    );

    const clear_activity = useCallback(
        async () => {
            setCurrentActivity(null);

            if (!await engine.is_connected()) {
                return;
            }

            return engine.clear_activity();
        },
        [engine]
    )

    useEffect(() => {
        (async () => {
            if ("_is_noop" in engine) {
                console.warn("DiscordPresenceProvider not used within a DiscordRPCEngineProvider, so will no-op.");
                return;
            }

            const connected = await engine.is_connected()
            if (enabled && !connected) {
                await engine.connect();

                // send staged activity immediately
                await send_current_activity();
            } else if (!enabled && connected) {
                await engine.disconnect();
            }
        })();
    }, [engine, enabled]);

    return (
        <DiscordPresenceContext.Provider value={{
            has_permission: engine.has_permission,
            is_connected: engine.is_connected,
            set_activity,
            clear_activity
        }}>
            {children}
        </DiscordPresenceContext.Provider>
    )
}

export const useDiscordPresence = (no_op_if_unavailable = true) => {
    const context = useContext(DiscordPresenceContext);
    if (!context) {
        if (no_op_if_unavailable) {
            console.warn("useDiscordPresence called outside DiscordPresenceProvider. Falling back to no-op");
            return {
                has_permission: async () => false,
                is_connected: async () => false,
                set_activity: async () => {},
                clear_activity: async () => {}
            }
        } else {
            throw new Error("useDiscordPresence must be used within a DiscordPresenceProvider (or set no_op_if_unavailable to true)");
        }
    }
}
