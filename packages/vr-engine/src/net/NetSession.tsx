import type { NetworkRoom, PeerID, PeerInfo } from "@hyperlinkvr/core";
import { useAuthSession, useNetworkEngineOptional, useWorldSession } from "@hyperlinkvr/react";
import { createContext, useContext, useEffect, useState } from "react";

import { useNavConsent } from "../engine/NavConsentGate";

interface NetSession {
    room: NetworkRoom | null;
    peers: PeerInfo[];
    host: PeerID | null;
}

const NO_SESSION: NetSession = { room: null, peers: [], host: null };

const NetSessionContext = createContext<NetSession>(NO_SESSION);

// TODO: instance selection (invites etc), everyone on a world shares one for now
const DEFAULT_INSTANCE = "main";

const world_key = (url: string) => {
    try {
        const parsed = new URL(url);
        parsed.hash = "";
        return parsed.href;
    } catch {
        return url;
    }
};

export const NetSessionProvider = ({ children }: { children: React.ReactNode }) => {
    const network = useNetworkEngineOptional();
    const { url } = useWorldSession();
    const { blocked } = useNavConsent();
    const username = useAuthSession()?.username ?? null;

    // don't announce the player into a room until they've consented to being in the world
    const world = url && !blocked ? world_key(url) : null;

    const [session, setSession] = useState<NetSession>(NO_SESSION);

    useEffect(() => {
        if (!network || !world) {
            return;
        }

        let room: NetworkRoom | null = null;
        let cancelled = false;
        let unlisten = () => {};

        network
            .join({ world, instance: DEFAULT_INSTANCE }, { username })
            .then((joined) => {
                if (cancelled) {
                    joined.leave();
                    return;
                }

                room = joined;

                const sync = () => setSession({ room: joined, peers: joined.peers(), host: joined.host() });
                unlisten = joined.on_event((event) => {
                    if (event.type === "closed") {
                        setSession(NO_SESSION);
                        return;
                    }

                    sync();
                });
                sync();
            })
            .catch((error) => {
                console.error("Failed to join room", error);
            });

        return () => {
            cancelled = true;
            unlisten();
            room?.leave();
            setSession(NO_SESSION);
        };
    }, [network, world, username]);

    return <NetSessionContext.Provider value={session}>{children}</NetSessionContext.Provider>;
};

export const useNetSession = () => useContext(NetSessionContext);
