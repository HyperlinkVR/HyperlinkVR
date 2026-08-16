import { publish_report } from "./event_bus";

export {version} from "../package.json";

export * as auth from "./auth";
export * as builders from "./builders";
export * as players from "./players";
export * as color from "./color";

import {bind_rtc_event, facilitate_rtc, send_via_rtc} from "./messenger";

export const connect = async () => {
    await facilitate_rtc();

    // connect reports to internal dispatch
    bind_rtc_event("HVRSDK_ENGINE_OBJECT_REPORT", (msg) => publish_report(msg.report));
    bind_rtc_event("HVRSDK_ENGINE_OBJECT_REPORT_BATCH", (msg) => {
        for (const report of msg.reports) {
            publish_report(report);
        }
    });
}

export const bind_messages = () => {
    console.log("Binding messages for HyperlinkVR Web SDK");

    // on recieving HVRSDK_READY event, dispatch DOM event
    // also set a window property to indicate that the sdk is ready, in case their code loaded after the event fired
    window.addEventListener("message", (event) => {
        if (event.data.type !== "HVRSDK_READY") {
            return;
        }

        window.dispatchEvent(new CustomEvent("hyperlinkvr_ready"));
        Object.defineProperty(window, "hyperlinkvr_ready", {
            value: true,
            writable: false,
            configurable: false,
        });
    });
}

export const wait_for_ready = (): Promise<void> => {
    if ((window as { hyperlinkvr_ready?: boolean }).hyperlinkvr_ready) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        window.addEventListener("hyperlinkvr_ready", () => resolve(), { once: true });
    });
};

// recommended approach!
export const on_ready = (callback: () => void): (() => void) => {
    const handler = () => callback();
    window.addEventListener("hyperlinkvr_ready", handler);

    // if the ready edge already passed before this subscription, fire once now
    // future readies (e.g. a relaunched host) still come through the listener
    if ((window as { hyperlinkvr_ready?: boolean }).hyperlinkvr_ready) {
        callback();
    }

    return () => window.removeEventListener("hyperlinkvr_ready", handler);
};

export const finished_loading = async () => {
    console.log("Notifying host that loading is finished");
    const res = await send_via_rtc({
        action: "HVRSDK_LOADING_FINISHED"
    });

    if (!res || !res.success) {
        throw new Error("Failed to notify host that loading is finished");
    }
}
