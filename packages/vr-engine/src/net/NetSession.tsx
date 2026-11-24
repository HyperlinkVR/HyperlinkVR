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

// why a shared session ended under us. v1 has no host migration (#28), so either of these ends the
// instance for this player — the world's logic and state lived on the host's page
export type SessionEnd = "host-left" | "connection-lost";

interface NetSession extends RoomState {
    mode: MultiplayerMode;
    ended: SessionEnd | null;
}

const NO_SESSION: RoomState = { room: null, peers: [], host: null };

const NetSessionContext = createContext<NetSession>({ ...NO_SESSION, mode: "solo", ended: null });

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
    const [ended, setEnded] = useState<SessionEnd | null>(null);

    useEffect(() => {
        if (!network || !world || !shared) {
            return;
        }

        let room: NetworkRoom | null = null;
        let cancelled = false;
        let unlisten = () => {};
        setEnded(null);

        network
            .join({ world, instance: DEFAULT_INSTANCE }, { username, id: uuid })
            .then((joined) => {
                if (cancelled) {
                    joined.leave();
                    return;
                }

                room = joined;
                const original_host = joined.host();

                const sync = () => setSession({ room: joined, peers: joined.peers(), host: joined.host() });
                unlisten = joined.on_event((event) => {
                    if (event.type === "closed") {
                        setSession(NO_SESSION);
                        // our own leave() closes with "left"; anything else dropped us
                        if (event.reason !== "left") {
                            setEnded((current) => current ?? "connection-lost");
                        }
                        return;
                    }

                    // the host only changes when the host leaves. the world's logic and state lived on
                    // its page, so nothing carries over to the new host — end the instance (v1, #17)
                    if (event.type === "host-changed" && event.host !== original_host) {
                        setEnded("host-left");
                        setSession(NO_SESSION);
                        joined.leave();
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

    return <NetSessionContext.Provider value={{ ...session, mode, ended }}>{children}</NetSessionContext.Provider>;
};

export const useNetSession = () => useContext(NetSessionContext);

// a solo guest has no account and no room, but still needs a player id: minted once per page load
const SOLO_GUEST_ID = `guest-${crypto.randomUUID()}`;

// the id this player is known by — never null, so null can only ever mean "the local player" as
// shorthand, never "a guest" (whether someone has an account is a separate fact: account_id). in a
// room that's the peer id — what the host stamps on forwarded reports and what remote spawns carry,
// so every engine agrees on it (for a logged-in user the node adopts the account uuid as the peer
// id, so it's the same value). outside a room it's the account uuid, or a minted id for a guest.
// use this, not the raw auth uuid, for anything player-scoped.
export const useLocalPlayerId = (): string => {
    const { room } = useNetSession();
    const uuid = useAuthSession()?.uuid ?? null;
    return room?.self.id ?? uuid ?? SOLO_GUEST_ID;
};
