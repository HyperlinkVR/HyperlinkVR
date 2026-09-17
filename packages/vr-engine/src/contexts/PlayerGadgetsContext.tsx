import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState
} from "react";

export type GadgetName = "camera";

type ActiveGadgets = Record<GadgetName, { active: boolean; spawn_key: number }>;

interface PlayerGadgetsContextType {
    active_gadgets: ActiveGadgets;
    spawn_gadget: (gadget: GadgetName) => void;
    despawn_gadget: (gadget: GadgetName) => void;
    respawn_gadget: (gadget: GadgetName) => void;
}

const PlayerGadgetsContext = createContext<PlayerGadgetsContextType | null>(
    null
);

export const PlayerGadgetsProvider = ({ children }: { children: React.ReactNode; }) => {
    const [active_gadgets, setActiveGadgets] = useState<ActiveGadgets>({
        camera: { active: false, spawn_key: 0 }
    });

    const spawn_gadget = useCallback(
        (gadget: GadgetName) => {
            setActiveGadgets((prev) =>
                prev[gadget].active
                    ? prev
                    : {
                          ...prev,
                          [gadget]: {
                              active: true,
                              spawn_key: prev[gadget].spawn_key + 1
                          }
                      }
            );
        },
        []
    );

    const despawn_gadget = useCallback(
        (gadget: GadgetName) => {
            setActiveGadgets((prev) =>
                !prev[gadget].active
                    ? prev
                    : {
                          ...prev,
                          [gadget]: {
                              active: false,
                              spawn_key: prev[gadget].spawn_key
                          }
                      }
            );
        },
        []
    );

    // explicitly respawn a gadget, even if it is already active
    const respawn_gadget = useCallback(
        (gadget: GadgetName) => {
            setActiveGadgets((prev) => ({
                ...prev,
                [gadget]: { active: true, spawn_key: prev[gadget].spawn_key + 1 }
            }));
        },
        []
    );

    const value = useMemo(
        () => ({
            active_gadgets,
            spawn_gadget,
            despawn_gadget,
            respawn_gadget
        }),
        [active_gadgets, spawn_gadget, despawn_gadget, respawn_gadget]
    );

    return (
        <PlayerGadgetsContext.Provider value={value}>
            {children}
        </PlayerGadgetsContext.Provider>
    );
};

export const usePlayerGadgets = () => {
    const context = useContext(PlayerGadgetsContext);
    if (!context) {
        throw new Error(
            "usePlayerGadgets must be used within a PlayerGadgetsProvider"
        );
    }
    return context;
};
