import { create_sdk_forwarder } from "@hyperlinkvr/sdk-forwarder";
import type { Message, WebSDKActionMessage } from "@hyperlinkvr/types";
import { defineContentScript } from "#imports";

import { URL_PATTERNS } from "~/util/url_patterns";

export default defineContentScript({
    matches: URL_PATTERNS,
    runAt: "document_start",
    main() {
        // the sdk shares this window, so page traffic arrives here directly and can be sent direct to the extension background
        create_sdk_forwarder({
            on_page_message: (handler) => {
                const listener = (event: MessageEvent) => handler(event.data);
                window.addEventListener("message", listener);
                return () => window.removeEventListener("message", listener);
            },

            post_to_page: (message) => {
                window.postMessage(message, window.location.origin);
            },

            send_to_backend: (message: WebSDKActionMessage) =>
                new Promise((resolve) => {
                    chrome.runtime.sendMessage(message, resolve);
                }),

            on_backend_message: (handler) => {
                const listener = (msg: Message) => {
                    handler(msg);
                };
                chrome.runtime.onMessage.addListener(listener);
                return () => chrome.runtime.onMessage.removeListener(listener);
            },

            page_url: () => window.location.href,

            // an arbitrary page can host the sdk here, so a launch must be something the user asked for
            user_activation_gate: () => navigator.userActivation?.isActive ?? false
        });
    }
});
