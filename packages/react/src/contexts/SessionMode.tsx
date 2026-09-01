import { createContext, useContext } from "react";


type SessionModeContextType = "vr" | "flat";
const SessionModeContext = createContext<SessionModeContextType | null>(null);

export const SessionModeProvider = SessionModeContext.Provider;

export const useSessionMode = () => {
    const value = useContext(SessionModeContext);
    if (value === null) {
        throw new Error("useSessionMode must be used within a SessionModeProvider");
    }
    return value;
}
