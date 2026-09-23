import { CONTENT_FRAME_NAME } from "@hyperlinkvr/types/windowing";

import type { QueuedCall } from "./types";



const global_window = window as any;

if (typeof global_window.hyperlinkvr === "undefined" && window.name === CONTENT_FRAME_NAME) {
    const queue: QueuedCall[] = [];

    const create_lazy_stub = (path: string[] = []): any => {
        const dummy = function () {};

        // capture all function calls and property accesses on the sdk proxy, and queue them for later replay
        return new Proxy(dummy, {
            get(_target, prop: string | symbol) {
                // prevent runtime promise-checks from treating the proxy itself as a Promise
                if (typeof prop === "symbol" || prop === "then") {
                    return undefined;
                }
                return create_lazy_stub([...path, prop as string]);
            },
            apply(_target, _this_arg, args) {
                return new Promise((resolve, reject) => {
                    queue.push({ path, args, resolve, reject });
                });
            }
        });
    }

    // attach proxy and expose the hidden queue for sdk.js to consume
    global_window.hyperlinkvr = create_lazy_stub();
    global_window.__hyperlinkvr_queue = queue;

    // inject real SDK asynchronously
    const loader_script = document.currentScript as HTMLScriptElement | null;
    if (loader_script) {
        const sdk_url = new URL("sdk.js", loader_script.src).href;
        const script = document.createElement("script");
        script.src = sdk_url;
        script.async = true;
        (document.head || document.documentElement).appendChild(script);
    }
}
