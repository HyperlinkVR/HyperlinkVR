import type { NetworkRoom, PeerID, PeerInfo } from "@hyperlinkvr/core";
import { useAuthSession, useNetworkEngineOptional, useWorldMetadata, useWorldSession } from "@hyperlinkvr/react";
import {canonicalise_url} from "@hyperlinkvr/auth";
import { createContext, useContext, useEffect, useState } from "react";

import { useNavConsent } from "../engine/NavConsentGate";
import { derive_mode, type MultiplayerMode } from "./mode";

interface RoomState {
    room: NetworkRoom | null;
    peers: PeerInfo[];
    host: PeerID | null;
}

interface NetSession extends RoomState {
    mode: MultiplayerMode;
}

const NO_SESSION: RoomState = { room: null, peers: [], host: null };

const NetSessionContext = createContext<NetSession>({ ...NO_SESSION, mode: "solo" });

// TODO: instance selection (invites etc), everyone on a world shares one for now
const DEFAULT_INSTANCE = "main";

const world_key = (url: string) => {
    try {
        return canonicalise_url(url);
    } catch {
        return url;
    }
};

export const NetSessionProvider = ({ children }: { children: React.ReactNode }) => {
    const network = useNetworkEngineOptional();
    const { url } = useWorldSession();
    const { blocked } = useNavConsent();
    const auth_session = useAuthSession();
    const username = auth_session?.username ?? null;
    const uuid = auth_session?.uuid;

    // don't announce the player into a room until they've consented to being in the world
    const world = url && !blocked ? world_key(url) : null;

    // solo vs shared is derived from max_players
    const mode = derive_mode(useWorldMetadata(url));
    const shared = mode === "shared";

    const [session, setSession] = useState<RoomState>(NO_SESSION);

    useEffect(() => {
        if (!network || !world || !shared) {
            return;
        }

        let room: NetworkRoom | null = null;
        let cancelled = false;
        let unlisten = () => {};

        network
            .join({ world, instance: DEFAULT_INSTANCE }, { username, id: uuid })
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
    }, [network, world, shared, username, uuid]);

    return <NetSessionContext.Provider value={{ ...session, mode }}>{children}</NetSessionContext.Provider>;
};

export const useNetSession = () => useContext(NetSessionContext);
