import * as sdk from "@hyperlinkvr/web-sdk";
import type { QueuedCall } from "./types";

const { _bind_messages, ...sdk_rest } = sdk;

_bind_messages();

const global_window = window as unknown as {
    hyperlinkvr?: unknown;
    __hyperlinkvr_queue?: QueuedCall[];
};

const queue = global_window.__hyperlinkvr_queue || [];
delete global_window.__hyperlinkvr_queue;

console.log(`Injecting SDK fallback, replaying ${queue.length} queued calls...`);

// expose the sdk onto global as usual
Object.defineProperty(window, "hyperlinkvr", {
    value: sdk_rest,
    writable: false,
    configurable: false
});

// replay any queued calls that were made before the SDK was loaded
for (const { path, args, resolve, reject } of queue) {
    try {
        // traverse the path to find the target function in the SDK
        let context: any = sdk_rest;
        for (let i = 0; i < path.length - 1; i++) {
            context = context?.[path[i]!];
        }

        const method_name = path[path.length - 1]!;
        const target_fn = context?.[method_name];

        if (typeof target_fn === "function") {
            const result = target_fn.apply(context, args);

            // handle both sync return values and Promises returned by real methods
            if (result && typeof result.then === "function") {
                result.then(resolve, reject);
            } else {
                resolve(result);
            }
        } else {
            reject(new TypeError(`hyperlinkvr.${path.join(".")} is not a function (queued call)`));
        }
    } catch (err) {
        reject(err);
    }
}
