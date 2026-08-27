import type { RefObject} from "react";
import { createContext, useContext } from "react";
import type { Group } from "three";

export type PlayerOriginContextType = RefObject<Group | null>;
const PlayerOriginContext = createContext<PlayerOriginContextType | null>(null);

export const PlayerOriginProvider = ({ children, value }: { children: React.ReactNode; value: PlayerOriginContextType }) => {
    return (
        <PlayerOriginContext.Provider value={value}>
            {children}
        </PlayerOriginContext.Provider>
    );
}

export const usePlayerOrigin = () => {
    const context = useContext(PlayerOriginContext);
    if (context === null) {
        throw new Error("usePlayerOrigin must be used within a PlayerOriginProvider");
    }

    return context;
}
