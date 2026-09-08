import { Backend, BackendIntegrationEngine } from "@hyperlinkvr/backend";
import type { SenderInfo } from "@hyperlinkvr/core";
import { URLParamsWindowArgumentsStrategy } from "@hyperlinkvr/platform-browser";
import { ExtensionMessageEngine, ExtensionStorageEngine } from "@hyperlinkvr/platform-extension";
import type { Message, WindowIntent } from "@hyperlinkvr/types";
import { defineBackground } from "#imports";
import browser from "webextension-polyfill";



import { check_url_allowed, URL_PATTERNS } from "~/util/url_patterns";





export default defineBackground(async () => {


    const WINDOW_INTENTS = {
        VR_HOST: "/vr_host.html",
        LOGIN: "/login.html",
        DEVTOOLS: "/devtools.html",
        DEVTOOLS_FORM: "/devtools-form.html",
        DEVTOOLS_WATCH_UI: "/devtools-watch.html",
        DEVTOOLS_SPY: "/devtools-spy.html"
    } as Record<WindowIntent, string>;

    const REAL_HOST_URL = new URL(WINDOW_INTENTS.VR_HOST, location.href).href;

    const get_window_url = (
        intent: WindowIntent,
        args?: Record<string, any>
    ) => {
        const base_url = WINDOW_INTENTS[intent];
        if (!base_url) {
            console.error("Unknown window intent:", intent);
            return null;
        }

        const url = new URL(base_url, location.href);
        if (args) {
            Object.entries(args).forEach(([key, value]) => {
                url.searchParams.set(key, value);
            });
        }

        return url.href;
    };

    class ExtensionBackendIntegration implements BackendIntegrationEngine {
        #args_strategy = new URLParamsWindowArgumentsStrategy();

        async create_window(params: {
            intent: WindowIntent;
            args?: Record<string, any>;
            width: number;
            height: number;
        }): Promise<number> {
            const url = get_window_url(params.intent);

            if (!url) {
                throw new Error(`Unknown intent ${params.intent}`);
            }

            const win = await browser.windows.create({
                url: params.args ? this.#args_strategy.serialise(params.args, {url}) : url,
                type: "popup",
                width: params.width,
                height: params.height
            });

            const id = win.id;
            if (!id) {
                throw new Error("Failed to create window");
            }

            return id;
        }

        focus_window(window_id: number): void {
            browser.windows.update(window_id, { focused: true });
        }

        async get_tab_info(
            tab_id: number
        ): Promise<{ url?: string; width?: number; height?: number }> {
            return browser.tabs.get(tab_id);
        }

        is_from_vr_host(sender: SenderInfo): boolean {
            if (!sender || !sender.url) {
                return false;
            }

            return sender.url.startsWith(REAL_HOST_URL);
        }

        is_url_launchable(url: string): boolean {
            return check_url_allowed(url);
        }

        navigate_tab(tab_id: number, new_url: string): void {
            browser.tabs.update(tab_id, { url: new_url });
        }

        navigate_tab_back(tab_id: number): void {
            browser.tabs.goBack(tab_id);
        }

        send_message_to_tab(tab_id: number, message: Message): Promise<any> {
            return browser.tabs.sendMessage(tab_id, message);
        }

        start_screenshare(tab_id: number): Promise<string> {
            if (
                typeof chrome === "undefined" ||
                typeof chrome.tabCapture === "undefined"
            ) {
                throw new Error("This browser does not support tab capture");
            }

            return new Promise((resolve) => {
                chrome.tabCapture.getMediaStreamId(
                    { targetTabId: tab_id },
                    resolve
                );
            });
        }
    }

    const integration = new ExtensionBackendIntegration();

    const storage_engines = {
        local: new ExtensionStorageEngine("local"),
        sync: new ExtensionStorageEngine("sync"),
        session: new ExtensionStorageEngine("session")
    };

    const message_engine = new ExtensionMessageEngine();

    const backend = new Backend({
        storage: storage_engines,
        message: message_engine,
        backend_integration: integration
    });

    backend.add_hook("on-meta", (value: string, tab_id: number) => {
        if (value === "supported") {
            browser.action.setBadgeText({
                tabId: tab_id,
                text: "✓"
            });
        } else {
            browser.action.setBadgeText({
                tabId: tab_id,
                text: null
            });
        }
    });

    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
        id: "launch-hyperlinkvr",
        title: "Launch HyperlinkVR",
        contexts: ["all"],
        documentUrlPatterns: URL_PATTERNS
    });

    browser.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "launch-hyperlinkvr") {
            if (!check_url_allowed(tab?.url || "")) {
                console.error("URL not allowed for HyperlinkVR:", tab?.url);
                return;
            }

            if (!tab?.id) {
                console.error("No tab id available for HyperlinkVR launch");
                return;
            }

            backend.launch_vr_host(tab.id);
        }
    });

    browser.action.setBadgeTextColor({
        color: "#fff"
    });

    // alert the vr host of changes in url
    browser.tabs.onUpdated.addListener((tab_id, change_info, tab) => {
        if (change_info.status === "loading") {
            backend.notify_navigation(tab);
        } else if (change_info.url) {
            backend.notify_non_navigation_url_change(tab_id, change_info.url);
        }

        // the document finished loading: any extension-initiated grace is spent, so a
        // later navigation is the page moving itself and must be re-checked
        if (change_info.status === "complete") {
            backend.notify_document_finished_loading(tab_id);
        }
    });

    // alert the vr host of the session closing
    browser.tabs.onRemoved.addListener((tab_id) => {
        backend.notify_tab_closed(tab_id);
    });

    browser.windows.onRemoved.addListener((window_id) => {
        backend.notify_window_closed(window_id);
    });
});
