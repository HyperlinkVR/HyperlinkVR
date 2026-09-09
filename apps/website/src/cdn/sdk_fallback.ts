import { CONTENT_FRAME_NAME } from "@hyperlinkvr/types";

const global_window = window as { hyperlinkvr?: unknown };

if (typeof global_window.hyperlinkvr === "undefined") {
    if (window.name === CONTENT_FRAME_NAME) {
        const loader_script = document.currentScript as HTMLScriptElement | null;

        if (loader_script) {
            const sdk_url = new URL("sdk.js", loader_script.src).href;

            // parser-blocking, sdk installs window.hyperlinkvr before any page script runs
            document.write('<script src="' + sdk_url + '"><' + "/script>");
        }
    }
}
