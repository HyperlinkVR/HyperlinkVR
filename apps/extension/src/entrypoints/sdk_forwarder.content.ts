import type { MaybeWithCorrelation, WebSDKActionMessage, WebSDKReplyMessage, WithCorrelation } from "@hyperlinkvr/types";
import { defineContentScript } from "#imports";



import { URL_PATTERNS } from "~/util/url_patterns";





export default defineContentScript({
    matches: URL_PATTERNS,
    runAt: "document_start",
    main() {
        window.addEventListener("message", (event) => {
            if (!("data" in event) || !event.data || typeof event.data !== "object") {
                return;
            }

            const sdk_message = {...event.data} as MaybeWithCorrelation<WebSDKActionMessage>;

            // only forward sdk messages
            if (sdk_message && sdk_message.action && sdk_message.action.startsWith("HVRSDK_")) {
                // only auto-launch on user activation to prevent abuse
                if (sdk_message.action === "HVRSDK_LAUNCH" && !navigator.userActivation?.isActive) {
                    console.warn("Dropping HVRSDK_LAUNCH: no user activation");

                    // reply rejection locally
                    if ("correlation_id" in sdk_message) {
                        const response_with_correlation: WithCorrelation<WebSDKReplyMessage> = {
                            for: sdk_message.action,
                            launching: false,
                            correlation_id: sdk_message.correlation_id!
                        };
                        window.postMessage(response_with_correlation, window.location.origin);
                    }

                    return;
                }

                let correlation_id: string | undefined = undefined;
                if ("correlation_id" in sdk_message) {
                    correlation_id = sdk_message.correlation_id;
                    delete sdk_message.correlation_id;
                }

                // add url to any HVRSDK_RTC_ messages
                if (sdk_message.action.startsWith("HVRSDK_RTC_")) {
                    console.log("Adding url to sdk message", sdk_message.action, window.location.href);
                    (sdk_message as any).url = window.location.href;
                }

                chrome.runtime.sendMessage(sdk_message, (response) => {
                    if (response && correlation_id) {
                        const response_with_correlation: WithCorrelation<WebSDKReplyMessage> = {
                            ...response,
                            correlation_id
                        };
                        window.postMessage(response_with_correlation, window.location.origin);
                    }
                });
            }
        });

        // special cases:
        // - always forward HVRSDK_RTC_OFFER and ICE_CANDIDATE messages from the background to the page since they arent reply based
        // - fire event on HVRSDK_READY event to let tab know they can connect (forward to injection and they'll make a DOM event)
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.for === "HVRSDK_RTC_OFFER" || msg.action === "HVRSDK_RTC_ICE_CANDIDATE") {
                console.log("Forwarding HVRSDK_RTC message to page", msg);
                window.postMessage(msg, window.location.origin);
            }

            if (msg.type === "HVRSDK_READY") {
                console.log("HVRSDK ready");
                window.postMessage(msg, window.location.origin);
            }
        });

        // query ready state on load as the page may be loaded after the vr host is already ready
        chrome.runtime.sendMessage({ action: "HVRSDK_QUERY_READY" },);
    }
});
