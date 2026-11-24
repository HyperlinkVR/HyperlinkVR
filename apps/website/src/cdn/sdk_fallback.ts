import { CONTENT_FRAME_NAME } from "@hyperlinkvr/types/windowing";

import type { QueuedCall } from "./types";



const global_window = window as any;

if (typeof global_window.hyperlinkvr === "undefined" && window.name === CONTENT_FRAME_NAME) {
    const queue: QueuedCall[] = [];
    let root_stub: any = null;

    // once sdk.js has replaced the global, a stub someone kept hold of (e.g. a module-level
    // `const h = hyperlinkvr.builders` that ran before sdk.js loaded) forwards to the real sdk, so
    // sync apis like builder chains work through it instead of turning into queued promises
    const resolve_real = (path: string[]) => {
        const real = global_window.hyperlinkvr;
        if (real === root_stub) return null;

        let owner: any = undefined;
        let value: any = real;
        for (const key of path) {
            owner = value;
            value = value?.[key];
        }
        return { owner, value };
    };

    const create_lazy_stub = (path: string[] = []): any => {
        const dummy = function () {};

        // capture all function calls and property accesses on the sdk proxy, and queue them for later replay
        return new Proxy(dummy, {
            get(_target, prop: string | symbol) {
                // prevent runtime promise-checks from treating the proxy itself as a Promise
                if (typeof prop === "symbol" || prop === "then") {
                    return undefined;
                }

                const real = resolve_real([...path, prop]);
                if (real) return real.value;

                return create_lazy_stub([...path, prop as string]);
            },
            apply(_target, _this_arg, args) {
                const real = resolve_real(path);
                if (real) return real.value.apply(real.owner, args);

                return new Promise((resolve, reject) => {
                    queue.push({ path, args, resolve, reject });
                });
            },
            construct(_target, args) {
                const real = resolve_real(path);
                if (real) return Reflect.construct(real.value, args);

                // a constructor's result is needed synchronously, so it can't be queued
                throw new TypeError(
                    `new hyperlinkvr.${path.join(".")}() was called before the SDK loaded; do it inside hyperlinkvr.on_ready`
                );
            }
        });
    }

    // attach proxy and expose the hidden queue for sdk.js to consume
    root_stub = create_lazy_stub();
    global_window.hyperlinkvr = root_stub;
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
