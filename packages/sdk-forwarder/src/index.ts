import type {
    MaybeWithCorrelation,
    Message,
    WebSDKActionMessage,
    WebSDKReplyMessage,
    WithCorrelation
} from "@hyperlinkvr/types";


export interface SDKForwarderTransport {
    on_page_message(handler: (data: unknown) => void): () => void;

    post_to_page(message: Message): void;

    send_to_backend(message: WebSDKActionMessage): Promise<unknown>;

    on_backend_message(handler: (message: Message) => void): () => void;

    page_url(): string | undefined;

    user_activation_gate?(): boolean;
}

const is_sdk_action = (data: unknown): data is MaybeWithCorrelation<WebSDKActionMessage> =>
    !!data &&
    typeof data === "object" &&
    typeof (data as { action?: unknown }).action === "string" &&
    (data as { action: string }).action.startsWith("HVRSDK_");

export interface SDKForwarder {
    query_ready(): void;

    dispose(): void;
}

export const create_sdk_forwarder = (transport: SDKForwarderTransport): SDKForwarder => {
    const reply_to_page = (
        reply: Partial<WebSDKReplyMessage> & { for: string },
        correlation_id: string | undefined
    ) => {
        if (!correlation_id) {
            // nothing is awaiting this, so there's nothing to correlate it to
            return;
        }

        transport.post_to_page({
            ...reply,
            correlation_id
        } as WithCorrelation<WebSDKReplyMessage>);
    };

    const unbind_page = transport.on_page_message((data) => {
        if (!is_sdk_action(data)) {
            return;
        }

        // copy before mutating: the sdk still owns the object it posted
        const message = { ...data };
        const correlation_id = message.correlation_id;
        delete message.correlation_id;

        if (
            message.action === "HVRSDK_LAUNCH" &&
            transport.user_activation_gate &&
            !transport.user_activation_gate()
        ) {
            console.warn("Dropping HVRSDK_LAUNCH: no user activation");
            reply_to_page({ for: message.action, launching: false }, correlation_id);
            return;
        }

        if (message.action.startsWith("HVRSDK_RTC_")) {
            const url = transport.page_url();
            if (url) {
                (message as WebSDKActionMessage & { url?: string }).url = url;
            }
        }

        transport
            .send_to_backend(message as WebSDKActionMessage)
            .then((response) => {
                if (response) {
                    reply_to_page(response as WebSDKReplyMessage, correlation_id);
                }
            })
            .catch((error) => {
                console.error("Failed to forward SDK message to backend:", message, error);

                reply_to_page(
                    {
                        for: message.action,
                        error: (error instanceof Error && error.message) || "Forwarding failed"
                    } as unknown as WebSDKReplyMessage,
                    correlation_id
                );
            });
    });

    const unbind_backend = transport.on_backend_message((message) => {
        const is_rtc_push =
            ("for" in message && message.for === "HVRSDK_RTC_OFFER") ||
            ("action" in message && message.action === "HVRSDK_RTC_ICE_CANDIDATE");

        const is_ready = "type" in message && message.type === "HVRSDK_READY";

        if (is_rtc_push || is_ready) {
            transport.post_to_page(message);
        }
    });

    const query_ready = () => {
        transport.send_to_backend({ action: "HVRSDK_QUERY_READY" }).catch(() => {
            // nothing listening yet is normal at this point
        });
    };

    query_ready();

    return {
        query_ready,
        dispose: () => {
            unbind_page();
            unbind_backend();
        }
    };
};
