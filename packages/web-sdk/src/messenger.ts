import type {
    NamedWebSDKAction,
    NamedWebSDKEvent,
    NamedWebSDKReplyOrVoid,
    WebSDKActionMessage,
    WebSDKActionName,
    WebSDKEventMessage,
    WithCorrelation
} from "@hyperlinkvr/types";


let rtc_data_channel: RTCDataChannel | null = null;
export const send_via_messaging = async <T extends WebSDKActionName>(
    message: NamedWebSDKAction<T>
): Promise<NamedWebSDKReplyOrVoid<T>> => {
    const correlation_id = crypto.randomUUID();
    const message_with_correlation: WithCorrelation<NamedWebSDKAction<T>> = {
        ...message,
        correlation_id
    };

    return new Promise((resolve, reject) => {
        const handle_message = (event: MessageEvent) => {
            const data = event.data as NamedWebSDKReplyOrVoid<T> & { correlation_id?: string; };
            // TODO: should this check for HVRSDK prefix?
            if (
                "for" in data &&
                data.for === message.action &&
                "correlation_id" in data &&
                data.correlation_id === correlation_id
            ) {
                window.removeEventListener("message", handle_message);

                const { correlation_id, ...without_correlation } = data;
                if ("error" in without_correlation && without_correlation.error) {
                    reject(new Error(String(without_correlation.error)));
                    return;
                }
                resolve(without_correlation as NamedWebSDKReplyOrVoid<T>);
            }
        };

        window.addEventListener("message", handle_message);
        window.postMessage(message_with_correlation, "*");
    });
};

type EventListenerMap = {
    [E in WebSDKEventMessage["type"]]?: Set<(event: NamedWebSDKEvent<E>) => void>;
};

const event_listeners: EventListenerMap = {};

export const bind_rtc_event = <E extends WebSDKEventMessage["type"]>(
    event_type: E,
    callback: (event: NamedWebSDKEvent<E>) => void
) => {
    if (!rtc_data_channel || rtc_data_channel.readyState !== "open") {
        throw new Error("RTC data channel is not open");
    }

    let listeners = event_listeners[event_type] as Set<(event: NamedWebSDKEvent<E>) => void> | undefined;
    if (!listeners) {
        listeners = new Set();
        event_listeners[event_type] = listeners as EventListenerMap[E];
    }
    listeners.add(callback);

    return () => {
        listeners.delete(callback);
    };
};

export const facilitate_rtc = async () => {
    const peer_connection = new RTCPeerConnection({ iceServers: [] });

    peer_connection.onicecandidate = (event) => {
        if (event.candidate) {
            send_via_messaging({
                action: "HVRSDK_RTC_ICE_CANDIDATE",
                candidate: event.candidate.toJSON()
            });
        }
    };

    const listener = async (event: MessageEvent) => {
        const data = event.data as any;

        // technically breaking how for works but doesnt matter since this is a special case
        if (data.for === "HVRSDK_RTC_OFFER") {
            const offer = new RTCSessionDescription(data.offer);
            await peer_connection.setRemoteDescription(offer);

            const answer = await peer_connection.createAnswer();
            await peer_connection.setLocalDescription(answer);

            send_via_messaging({
                action: "HVRSDK_RTC_ANSWER",
                answer: answer
            });
        } else if (data.action === "HVRSDK_RTC_ICE_CANDIDATE") {
            const candidate = new RTCIceCandidate(data.candidate);
            await peer_connection.addIceCandidate(candidate);
        }
    };

    window.addEventListener("message", listener);

    // create a new listener that is bound once the data channel is open, and will forward events to the bound listeners
    const data_channel_listener = (event: MessageEvent) => {
        if (!rtc_data_channel || rtc_data_channel.readyState !== "open") {
            return;
        }

        const data = JSON.parse(event.data) as any;
        if ("type" in data && data.type in event_listeners) {
            const listeners =
                event_listeners[data.type as keyof EventListenerMap];
            if (listeners) {
                for (const callback of listeners) {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error(
                            `Error in event listener for event ${data.type}:`,
                            e
                        );
                    }
                }
            }
        }
    };

    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error("RTC connection request timed out");
            reject(new Error("RTC connection request timed out"));
        }, 5000);

        peer_connection.ondatachannel = (event) => {
            rtc_data_channel = event.channel;

            rtc_data_channel.onopen = () => {
                console.log("RTC data channel opened");
                clearTimeout(timeout);
                window.removeEventListener("message", listener);
                rtc_data_channel!.addEventListener(
                    "message",
                    data_channel_listener
                );
                resolve();
            };
            rtc_data_channel.onclose = () => {
                console.log("RTC data channel closed");
                rtc_data_channel!.removeEventListener(
                    "message",
                    data_channel_listener
                );
                rtc_data_channel = null;
            };
        };

        send_via_messaging({ action: "HVRSDK_RTC_REQUEST" }).catch((err) => {
            console.error("Failed to request RTC connection:", err);
            reject(err);
        });
    });
};

export const send_via_rtc = async <T extends WebSDKActionName>(
    message: NamedWebSDKAction<T>
): Promise<NamedWebSDKReplyOrVoid<T>> => {
    if (!rtc_data_channel || rtc_data_channel.readyState !== "open") {
        throw new Error("RTC data channel is not open");
    }

    const correlation_id = crypto.randomUUID();
    const message_with_correlation: WithCorrelation<WebSDKActionMessage> = {
        ...message,
        correlation_id
    };

    return new Promise((resolve, reject) => {
        const handle_message = (event: MessageEvent) => {
            const data = JSON.parse(event.data) as any;
            if (
                "for" in data &&
                data.for === message.action &&
                "correlation_id" in data &&
                data.correlation_id === correlation_id
            ) {
                rtc_data_channel?.removeEventListener("message", handle_message);

                const { correlation_id, ...without_correlation } = data;
                if ("error" in without_correlation && without_correlation.error) {
                    reject(new Error(String(without_correlation.error)));
                    return;
                }
                resolve(without_correlation);
            }
        };

        rtc_data_channel!.addEventListener("message", handle_message);
        rtc_data_channel!.send(JSON.stringify(message_with_correlation));
    });
};

export const send = async <T extends WebSDKActionName>(
    message: NamedWebSDKAction<T>
): Promise<NamedWebSDKReplyOrVoid<T>> => {
    if (!rtc_data_channel || rtc_data_channel.readyState !== "open") {
        return send_via_messaging(message);
    }

    return send_via_rtc(message);
};
