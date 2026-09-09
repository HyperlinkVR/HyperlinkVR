import { Backend, type BackendIntegrationEngine } from "@hyperlinkvr/backend";
import type { SenderInfo } from "@hyperlinkvr/core";
import { BrowserMessageEngine, BrowserStorageEngine, URLParamsWindowArgumentsStrategy } from "@hyperlinkvr/platform-browser";
import type { Message, WindowIntent } from "@hyperlinkvr/types";





export const get_args_strategy = () => new URLParamsWindowArgumentsStrategy();


// only supports 1 hypothetical tab for now. could support more in future but doesnt make much sense ux wise
// TODO: although, do the tab functions ever get called for stuff like devtools windows? double check first
export const SINGLE_TAB_ID = -1;

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

interface CreateWindowParams {
    intent: WindowIntent;
    args?: Record<string, any>;
    width?: number;
    height?: number;
}

let create_window_callback: ((params: CreateWindowParams) => Promise<number>) | null = null;

export const set_create_window_callback = (callback: (params: CreateWindowParams) => Promise<number>) => {
    create_window_callback = callback;
}

let focus_window_callback: ((window_id: number) => void) | null = null;

export const set_focus_window_callback = (callback: (window_id: number) => void) => {
    focus_window_callback = callback;
}

// TODO: are these callbacks a smell? should the integration class be decomposed somehow (or replaced fully wiht callbacks)
// or worst case should it be passed in to a function that defers creation of backend (but may as well just pass the integration class atp
// lets just wait to see how the browser port gets implemented to decide

const VR_HOST_URL = new URL("/play/windows/vr_host", location.href).href;

export const content_message_engine = new BrowserMessageEngine();
export const host_message_engine = new BrowserMessageEngine();

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

        // just use the content message engine as it'll already point to the right tab
        return content_message_engine.send(message);
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
    }): Promise<number> {
        if (params.intent === "VR_HOST") {
            console.warn("Dropping create for VR_HOST intent");
            return -1;
        }

        if (!create_window_callback) {
            throw new Error("No callback set for windowing");
        }

        return create_window_callback(params);
    }

    focus_window(window_id: number): void {
        if (window_id === -1) {
            console.warn("Dropping focus for bogus window ID");
            return;
        }

        if (!focus_window_callback) {
            throw new Error("No callback set for window focusing");
        }

        focus_window_callback(window_id);
    }

    is_from_vr_host(sender: SenderInfo): boolean {
        return (sender.url && sender.url === VR_HOST_URL) || false;
    }
    // TODO: explore screensharing options that wont need prompt (or could be granted once off) or perhaps use the extension as a thin assistant
}

export const backend = new Backend({
    storage: {
        local: new BrowserStorageEngine("local"),
        sync: new BrowserStorageEngine("sync"),
        session: new BrowserStorageEngine("session")
    },
    message: host_message_engine,
    backend_integration: new BrowserBackendIntegration()
});

// pretend the vr host is launched, as its statically in an iframe so wont matter (just need the active session)
backend.launch_vr_host(SINGLE_TAB_ID);

export const set_current_url = (url: string) => {
    current_url = url;
    backend.notify_navigation({id: SINGLE_TAB_ID, url});
};
