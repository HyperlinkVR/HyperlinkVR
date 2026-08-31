import {
    DiscordRPCEngine,
    MessageEngine,
    StorageEngine,
    StorageKind
} from "@hyperlinkvr/core";
import { createContext, useContext } from "react";





export type StorageEnginesContextType<K extends StorageKind = StorageKind> = {
    [P in K]?: StorageEngine<P>;
};
const StorageEnginesContext = createContext<StorageEnginesContextType | null>(
    null
);

export const StorageEnginesProvider = ({
    children,
    engines
}: {
    children: React.ReactNode;
    engines: StorageEnginesContextType;
}) => {
    return (
        <StorageEnginesContext.Provider value={engines}>
            {children}
        </StorageEnginesContext.Provider>
    );
};
export const useStorageEngines = (): StorageEnginesContextType => {
    const context = useContext(StorageEnginesContext);
    if (!context) {
        throw new Error(
            "useStorageEngines must be used within a StorageEnginesProvider"
        );
    }
    return context;
};

export const useStorageEngine = <K extends StorageKind>(
    kind: K
): StorageEngine<K> => {
    const engines = useStorageEngines();
    const engine = engines[kind];
    if (!engine) {
        throw new Error(`Storage engine for kind "${kind}" is not available`);
    }

    return engine;
};

const MessageEngineContext = createContext<MessageEngine | null>(null);

export const MessageEngineProvider = ({
    children,
    engine
}: {
    children: React.ReactNode;
    engine: MessageEngine;
}) => {
    return (
        <MessageEngineContext.Provider value={engine}>
            {children}
        </MessageEngineContext.Provider>
    );
};
export const useMessageEngine = (): MessageEngine => {
    const context = useContext(MessageEngineContext);
    if (!context) {
        throw new Error(
            "useMessageEngine must be used within a MessageEngineProvider"
        );
    }
    return context;
};


const DiscordRPCEngineContext = createContext<DiscordRPCEngine | null>(null);

export const DiscordRPCEngineProvider = ({
    children,
    engine
}: {
    children: React.ReactNode;
    engine: DiscordRPCEngine;
}) => {
    return (
        <DiscordRPCEngineContext.Provider value={engine}>
            {children}
        </DiscordRPCEngineContext.Provider>
    );
};
export const useDiscordRPCEngine = (): DiscordRPCEngine => {
    const context = useContext(DiscordRPCEngineContext);
    if (!context) {
        throw new Error(
            "useDiscordRPCEngine must be used within a DiscordRPCEngineProvider"
        );
    }
    return context;
};

export const useDiscordRPCEngineOptional = (): DiscordRPCEngine | null => {
    const context = useContext(DiscordRPCEngineContext);
    return context;
};
