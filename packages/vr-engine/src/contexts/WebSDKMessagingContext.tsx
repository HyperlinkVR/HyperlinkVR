import type { MessageChannel } from "@hyperlinkvr/core";
import { useMessageEngine, useStorageEngines, useWorldSession } from "@hyperlinkvr/react";
import type { NamedAction, NamedEvent, NamedReply, WebSDKActionMessage, WebSDKActionName, WebSDKErrorReply, WebSDKEventMessage } from "@hyperlinkvr/types";
import type { HandlerData } from "@hyperlinkvr/web-sdk-handlers";
import { builtin_handlers, handle_web_sdk } from "@hyperlinkvr/web-sdk-handlers";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";



import { clear_collider_collision_info } from "../physics/collision_hooks";
import { useEngineObjectStore } from "../stores/EngineObjectStore";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";


interface WebSDKMessagingContextType {
    wait_for_action: <M extends WebSDKActionName>(action_filter: M) => Promise<{
        message: NamedAction<M>;
        reply: (message: NamedReply<M> | WebSDKErrorReply<M>) => void;
    }>;

    on_action: <M extends WebSDKActionName>(action_filter: M, callback: (message: NamedAction<M>, reply: (message: NamedReply<M> | WebSDKErrorReply<M>) => void) => void) => () => void;
    emit_event: (message: WebSDKEventMessage) => void;

    connected: boolean;
}

// TODO: how to deal with multiple tabs at once? for now just assume a single connection at a time and check it matches the url we expect

const WebSDKMessagingContext = createContext<WebSDKMessagingContextType | null>(null);

export const WebSDKMessagingProvider = ({children}: {children: React.ReactNode}) => {
    const messenger = useMessageEngine();

    const {id, spy_active} = useWorldSession();

    const peer_connection_ref = useRef<RTCPeerConnection | null>(null);
    const data_channel_ref = useRef<RTCDataChannel | null>(null);
    const ready_port_ref = useRef<MessageChannel | null>(null);
    const sdk_origin_ref = useRef<string | undefined>(undefined);
    const [connected, setConnected] = useState(false);

    const storage = useStorageEngines();

    // the data channel callbacks are memoised with stable deps so a spy opening/closing
    // doesn't tear down the RTC connection; they read the live value through this ref
    const spy_ref = useRef(spy_active);
    useEffect(() => { spy_ref.current = spy_active; }, [spy_active]);

    const action_map_ref = useRef<Map<WebSDKActionName, Set<(message: NamedAction<any>, reply: (message: NamedReply<any> | WebSDKErrorReply) => void) => void>>>(new Map());
    const pending_actions_ref = useRef<Map<WebSDKActionName, any[]>>(new Map());

    const sdk_peer = () => sdk_origin_ref.current ? { sdk_origin: sdk_origin_ref.current } : "vr-host";

    const send_over_data_channel = useCallback((message: any) => {
        if (spy_ref.current) {
            messenger.send<NamedEvent<"HVR_SPY">>({
                type: "HVR_SPY",
                context: "sdk",
                from: "vr-host",
                to: sdk_peer(),
                message,
                ts: Date.now()
            });
        }

        data_channel_ref.current?.send(JSON.stringify(message));
    }, []);

    const handle_data_channel_message = useCallback((event: MessageEvent) => {
        const data = JSON.parse(event.data) as any;

        if (spy_ref.current) {
            messenger.send<NamedEvent<"HVR_SPY">>({
                type: "HVR_SPY",
                context: "sdk",
                from: sdk_peer(),
                to: "vr-host",
                message: data as any,
                ts: Date.now()
            });
        }

        if (!("action" in data)) {
            return;
        }

        const handlers = action_map_ref.current.get(data.action);
        if (handlers && handlers.size > 0) {
            handlers.forEach((handler) => {
                handler(data, (reply_message: NamedReply<any> | WebSDKErrorReply) => {
                    send_over_data_channel({ ...reply_message, correlation_id: data.correlation_id });
                });
            });
            return;
        }

        console.warn("No handler registered yet for action, buffering:", data.action);
        const pending = pending_actions_ref.current.get(data.action) || [];
        pending.push(data);
        pending_actions_ref.current.set(data.action, pending);
    }, []);

    // TODO: this code kinda sucks, same for how the background handles it. but it works :)

    useEffect(() => {
        // the existence of this port tells the background script that the host is ready for RTC connections
        // not used for any messages
        ready_port_ref.current = messenger.connect(`hvr-ready:${id}`);

        let unlisten: (() => void) | null = null;

        const handle_message = async (data: WebSDKActionMessage) => {
            if (!("target" in data) || data.target !== "vr-host" || (data as any).tab !== id) {
                return;
            }

            if (data.action === "HVRSDK_RTC_REQUEST") {
                // the background stamps the page's origin onto forwarded RTC messages
                // remember it so spy events can attribute this data channel's traffic
                sdk_origin_ref.current = (data as any).origin;

                // a navigation or reconnect supersedes any existing connection.
                // single-session in the background guarantees this request is for
                // our tab, so there's no url/tab gate needed here.
                // TODO: re-add a tab-id gate if multi-session ever returns

                // first load, page navigation, or the host hot-reloading in dev
                // wipe the previous session's world state now, while the data channel is still torn down, so it happens before the game starts spawning again
                // (fixes stuck state after hmr)
                useEngineObjectStore.getState().clear_all_objects();
                useWorldLoadingStateStore.getState().reset_for_new_document();
                clear_collider_collision_info();

                if (data_channel_ref.current) {
                    data_channel_ref.current.removeEventListener("message", handle_data_channel_message);
                    data_channel_ref.current.close();
                    data_channel_ref.current = null;
                }
                if (peer_connection_ref.current) {
                    peer_connection_ref.current.close();
                    peer_connection_ref.current = null;
                }

                const pc = new RTCPeerConnection({ iceServers: [] });
                peer_connection_ref.current = pc;

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        messenger.send({
                            target: "cs",
                            tab: id,
                            action: "HVRSDK_RTC_ICE_CANDIDATE",
                            candidate: event.candidate.toJSON()
                        });
                    }
                };

                const data_channel = pc.createDataChannel("web-sdk");
                data_channel_ref.current = data_channel;
                data_channel.addEventListener("message", handle_data_channel_message);

                data_channel.onopen = () => {
                    console.log("Data channel open");
                    setConnected(true);
                };

                data_channel.onclose = () => {
                    console.log("Data channel closed");
                    data_channel.removeEventListener("message", handle_data_channel_message);
                    data_channel_ref.current = null;
                    setConnected(false);
                };

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                messenger.send({
                    target: "cs",
                    tab: id,
                    for: "HVRSDK_RTC_OFFER",
                    offer
                });
            } else if (data.action === "HVRSDK_RTC_ICE_CANDIDATE") {
                if (peer_connection_ref.current) {
                    const candidate = new RTCIceCandidate(data.candidate);
                    await peer_connection_ref.current.addIceCandidate(candidate);
                }
            } else if (data.action === "HVRSDK_RTC_ANSWER") {
                if (peer_connection_ref.current) {
                    const answer = new RTCSessionDescription(data.answer);
                    await peer_connection_ref.current.setRemoteDescription(answer);
                }
            }
        };

        unlisten = messenger.listen(handle_message);

        return () => {
            if (unlisten) {
                unlisten();
                unlisten = null;
            }

            setConnected(false);

            ready_port_ref.current?.disconnect();
            ready_port_ref.current = null;

            if (data_channel_ref.current) {
                data_channel_ref.current.removeEventListener("message", handle_data_channel_message);
                data_channel_ref.current.close();
                data_channel_ref.current = null;
            }

            if (peer_connection_ref.current) {
                peer_connection_ref.current.close();
                peer_connection_ref.current = null;
            }
        };
    }, [id, handle_data_channel_message]);

    useEffect(() => {
        // add built in handlers
        for (const action_name in builtin_handlers) {
            const handler = (message: NamedAction<any>, reply: (message: NamedReply<any> | WebSDKErrorReply) => void) => {
                handle_web_sdk({ message, storage } as HandlerData<WebSDKActionName>).then((response) => {
                    if (response) {
                        reply(response);
                    }
                }).catch((error) => {
                    console.error("Error handling SDK message:", message, "Error:", error);
                    reply({ for: message.action as WebSDKActionName, error: error instanceof Error ? error.message : "Unknown error" });
                });
            }

            const handlers = action_map_ref.current.get(action_name as WebSDKActionName) || new Set();
            handlers.add(handler);
            action_map_ref.current.set(action_name as WebSDKActionName, handlers);
        }

        return () => {
            action_map_ref.current.clear();
        };
    }, []);

    const on_action = useCallback(
        <M extends WebSDKActionName>(action_filter: M, callback: (message: NamedAction<M>, reply: (message: NamedReply<M> | WebSDKErrorReply<M>) => void) => void) => {
            const handler = (message: NamedAction<any>, reply: (message: NamedReply<any> | WebSDKErrorReply) => void) => {
                if (!action_filter || message.action === action_filter) {
                    callback(message as NamedAction<M>, reply as (message: NamedReply<M> | WebSDKErrorReply<M>) => void);
                }
            };

            const handlers = action_map_ref.current.get(action_filter) || new Set();
            handlers.add(handler);
            action_map_ref.current.set(action_filter, handlers);

            // drain any pending actions for this filter (as it is now ready to recieve!)
            const pending = pending_actions_ref.current.get(action_filter);
            if (pending && pending.length > 0) {
                pending_actions_ref.current.delete(action_filter);
                for (const data of pending) {
                    handler(data, (reply_message: NamedReply<any> | WebSDKErrorReply) => {
                        send_over_data_channel({ ...reply_message, correlation_id: data.correlation_id });
                    });
                }
            }

            return () => {
                const handlers = action_map_ref.current.get(action_filter);
                if (handlers) {
                    handlers.delete(handler);
                }
            };
        }, []);

    const wait_for_action = useCallback(
        <M extends WebSDKActionName>(action_filter: M) => {
            return new Promise<{
                message: NamedAction<M>;
                reply: (message: NamedReply<M> | WebSDKErrorReply<M>) => void;
            }>((resolve) => {
                const unsubscribe = on_action(action_filter, (message, reply) => {
                    resolve({ message, reply });
                    unsubscribe();
                });
            });
        }, [on_action]);

    const emit_event = useCallback((message: WebSDKEventMessage) => {
        if (!peer_connection_ref.current || !data_channel_ref.current || data_channel_ref.current.readyState !== "open") {
            throw new Error("No connection established");
        }

        send_over_data_channel(message);
    }, []);

    return (
        <WebSDKMessagingContext.Provider value={{ wait_for_action, on_action, emit_event, connected }}>
            {children}
        </WebSDKMessagingContext.Provider>
    );
}

export const useWebSDKMessaging = () => {
    const context = useContext(WebSDKMessagingContext);
    if (!context) {
        throw new Error("useWebSDKMessaging must be used within a WebSDKMessagingProvider");
    }
    return context;
}

// TODO: should it be a zustand store instead?
