import { publish_report } from "./event_bus";

export {version} from "../package.json";

export * as auth from "./auth";
export * as builders from "./builders";
export * as color from "./color";

// re-export markers api with loader name shortened
import * as markers_imp from "./markers";
import { bind_rtc_event, facilitate_rtc, send_via_rtc } from "./messenger";
import { _dispatch_spawn as dispatch_player_spawn } from "./players";

const { load_markers, ...rest_markers_imp } = markers_imp;
export const markers = {
    load: load_markers,
    ...rest_markers_imp
}

// re-export players api omitting the internal _dispatch_spawn function
import * as players_imp from "./players";

const { _dispatch_spawn, ...rest_players_imp } = players_imp;
export const players = {
    ...rest_players_imp
}

let unbind_rtc_events: (() => void) | undefined;
export const connect = async () => {
    // unbind any previous bindings, if they exist. could use a disconnect handler but this works just as well
    if (unbind_rtc_events) {
        unbind_rtc_events();
    }


    await facilitate_rtc();

    // connect reports to internal dispatch
    const unbind_report = bind_rtc_event("HVRSDK_ENGINE_OBJECT_REPORT", (msg) => publish_report(msg.report));
    const unbind_report_batch = bind_rtc_event("HVRSDK_ENGINE_OBJECT_REPORT_BATCH", (msg) => {
        for (const report of msg.reports) {
            publish_report(report);
        }
    });

    const unbind_spawn = bind_rtc_event("HVRSDK_PLAYER_SPAWNED", (msg) => dispatch_player_spawn(msg));

    unbind_rtc_events = () => {
        unbind_report();
        unbind_report_batch();
        unbind_spawn();
    }
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
