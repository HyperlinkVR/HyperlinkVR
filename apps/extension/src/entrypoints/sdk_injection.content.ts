import { defineContentScript } from "#imports";

import { URL_PATTERNS } from "~/util/url_patterns";

import * as sdk from "@hyperlinkvr/web-sdk";

export default defineContentScript({
    matches: URL_PATTERNS,
    world: "MAIN",
    runAt: "document_start",
    main() {
        console.log("Injecting HyperlinkVR SDK into page context");
        const {_bind_messages, ...sdk_rest} = sdk;

        _bind_messages();

        Object.defineProperty(window, "hyperlinkvr", {
            value: sdk_rest,
            writable: false,
            configurable: false,
        });

        // TODO: opt out with well-known data or the meta tag
    }
});
