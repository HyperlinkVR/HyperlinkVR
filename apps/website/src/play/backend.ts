import { Backend, type BackendIntegrationEngine } from "@hyperlinkvr/backend";
import type { SenderInfo } from "@hyperlinkvr/core";
import { BrowserMessageEngine, BrowserStorageEngine, URLParamsWindowArgumentsStrategy } from "@hyperlinkvr/platform-browser";
import { create_sdk_forwarder } from "@hyperlinkvr/sdk-forwarder";
import type { Message, WindowIntent } from "@hyperlinkvr/types";


const args_strategy = new URLParamsWindowArgumentsStrategy();

export const get_args_strategy = () => args_strategy;


// only supports 1 hypothetical tab for now. could support more in future but doesnt make much sense ux wise
// TODO: although, do the tab functions ever get called for stuff like devtools windows? double check first
export const SINGLE_TAB_ID = 1;

let current_url: string | undefined = undefined;
let width: number | undefined = undefined;
let height: number | undefined = undefined;

export const set_dimensions = (new_width: number, new_height: number) => {
    width = new_width;
    height = new_height;
}

let navigate_callback: ((url: string) => void) | null = null;
let navigate_back_callback: (() => void) | null = null;

export const set_navigate_callback = (callback: (url: string) => void) => {
    navigate_callback = callback;
}

export const set_navigate_back_callback = (callback: () => void) => {
    navigate_back_callback = callback;
}

const WINDOW_INTENTS: Partial<Record<WindowIntent, string>> = {
    VR_HOST: "/play/windows/vr_host/",
    SETTINGS: "/play/windows/settings/",
    DEVTOOLS: "/play/windows/devtools/",
    DEVTOOLS_FORM: "/play/windows/devtools/form/",
    DEVTOOLS_WATCH_UI: "/play/windows/devtools/watch/",
    DEVTOOLS_SPY: "/play/windows/devtools/spy/"
    // LOGIN has no play window as signing in will happen on the real site
};

const window_url = (intent: WindowIntent, args?: Record<string, any>): string | null => {
    const path = WINDOW_INTENTS[intent];
    if (!path) {
        console.error("No play window for intent:", intent);
        return null;
    }

    const url = new URL(path, location.href).href;
    return args ? args_strategy.serialise(args, { url }) : url;
};

const VR_HOST_URL = window_url("VR_HOST")!;

export const host_message_engine = new BrowserMessageEngine({
    sender: { url: VR_HOST_URL, origin: location.origin }
});

export const attach_host_window = (host_window: Window) => {
    host_message_engine.set_target_window(host_window);
};

let next_window_id = 1;
const open_windows = new Map<number, Window>();
let window_watch: ReturnType<typeof setInterval> | null = null;

const watch_open_windows = () => {
    if (window_watch !== null) return;

    window_watch = setInterval(() => {
        for (const [id, win] of open_windows) {
            if (!win.closed) continue;

            open_windows.delete(id);
            host_message_engine.remove_peer(win);
            backend.notify_window_closed(id);
        }

        if (open_windows.size === 0 && window_watch !== null) {
            clearInterval(window_watch);
            window_watch = null;
        }
    }, 1000);
};


let content_window: Window | null = null;

const content_page_handlers = new Set<(data: unknown) => void>();
const backend_page_handlers = new Set<(message: Message) => void>();

window.addEventListener("message", (event) => {
    // any origin, but only ever the one frame we handed to the user
    if (!content_window || event.source !== content_window) {
        return;
    }

    content_page_handlers.forEach((handler) => handler(event.data));
});

const content_sender = (): SenderInfo => {
    let origin: string | undefined;
    try {
        origin = current_url ? new URL(current_url).origin : undefined;
    } catch {
        origin = undefined;
    }

    return { tab_id: SINGLE_TAB_ID, url: current_url, origin };
};

const forwarder = create_sdk_forwarder({
    on_page_message: (handler) => {
        content_page_handlers.add(handler);
        return () => content_page_handlers.delete(handler);
    },

    post_to_page: (message) => {
        content_window?.postMessage(message, "*");
    },

    send_to_backend: (message) => host_message_engine.deliver(message, content_sender()),

    on_backend_message: (handler) => {
        backend_page_handlers.add(handler);
        return () => backend_page_handlers.delete(handler);
    },

    page_url: () => current_url
});

export const attach_content_window = (win: Window) => {
    content_window = win;
};

export const notify_content_loaded = () => {
    // any grace we granted for this navigation is spent, so the next one is re-checked
    backend.notify_document_finished_loading(SINGLE_TAB_ID);

    // the host may already be up, in which case the ready edge fired before this document existed
    forwarder.query_ready();
};


class BrowserBackendIntegration implements BackendIntegrationEngine {
    async get_tab_info(
        tab_id: number
    ): Promise<{ url?: string; width?: number; height?: number }> {
        if (tab_id !== SINGLE_TAB_ID) {
            console.warn(`Dropping request for tab ${tab_id}`);
            return {};
        }

        return {
            url: current_url,
            width,
            height
        };
    }

    async send_message_to_tab(tab_id: number, message: Message): Promise<any> {
        if (tab_id !== SINGLE_TAB_ID) {
            console.warn(`Dropping request for tab ${tab_id}`);
            return null;
        }

        backend_page_handlers.forEach((handler) => handler(message));

        // a cross-origin frame has no reply path for pushes like this, and nothing awaits one
        return null;
    }

    navigate_tab(tab_id: number, new_url: string): void {
        if (tab_id !== SINGLE_TAB_ID) {
            console.warn(`Dropping request for tab ${tab_id}`);
            return;
        }

        if (!navigate_callback) {
            throw new Error("No callback set for navigation");
        }

        navigate_callback(new_url);
    }

    navigate_tab_back(tab_id: number): void {
        if (tab_id !== SINGLE_TAB_ID) {
            console.warn(`Dropping request for tab ${tab_id}`);
            return;
        }

        if (!navigate_back_callback) {
            throw new Error("No callback set for backwards navigation");
        }

        navigate_back_callback();
    }

    async create_window(params: {
        intent: WindowIntent;
        args?: Record<string, any>;
        width?: number;
        height?: number;
    }, as_window = true): Promise<number> {
        // TODO: window.open popup not ideal, might be better to handle in dom contextually
        // tbh the windowing could be optional, the game doenst call this, just the extension, so could just handle via links manually

        // TODO: either delegate to currnetly open window to stop popup blocker firing, or just never use popup mode

        if (params.intent === "VR_HOST") {
            console.warn("Dropping create for VR_HOST intent");
            return -1;
        }

        const url = window_url(params.intent, params.args);
        if (!url) {
            throw new Error(`Unknown intent ${params.intent}`);
        }

        const features = [
            as_window ? "popup=yes" : "",
            params.width ? `width=${params.width}` : "",
            params.height ? `height=${params.height}` : ""
        ]
            .filter(Boolean)
            .join(",");

        const win = window.open(url, "_blank", features);
        if (!win) {
            throw new Error("Failed to create window (likely blocked by the popup blocker)");
        }

        const id = next_window_id++;
        open_windows.set(id, win);

        host_message_engine.add_peer(win, { url, origin: location.origin });
        watch_open_windows();

        return id;
    }

    focus_window(window_id: number): void {
        const win = open_windows.get(window_id);
        if (!win) {
            console.warn("Dropping focus for unknown window ID", window_id);
            return;
        }

        win.focus();
    }

    is_from_vr_host(sender: SenderInfo): boolean {
        return (sender.url && sender.url.startsWith(VR_HOST_URL)) || false;
    }
    // TODO: explore screensharing options that wont need prompt (or could be granted once off) or perhaps use the extension as a thin assistant
}

export const backend_integration = new BrowserBackendIntegration();

export const backend = new Backend({
    storage: {
        local: new BrowserStorageEngine("local"),
        sync: new BrowserStorageEngine("sync"),
        session: new BrowserStorageEngine("session")
    },
    message: host_message_engine,
    backend_integration
});

// pretend the vr host is launched, as its statically in an iframe so wont matter (just need the active session)
backend.launch_vr_host(SINGLE_TAB_ID);

export const set_current_url = (url: string) => {
    current_url = url;
    backend.notify_navigation({id: SINGLE_TAB_ID, url});
};

export const navigate_from_ui = (url: string) => {
    backend.grant_navigation_grace(SINGLE_TAB_ID);
    navigate_callback?.(url);
};
