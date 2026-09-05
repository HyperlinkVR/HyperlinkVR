import { ExtensionStorage } from "@hyperlinkvr/platform-extension";
import type { WindowIntent } from "@hyperlinkvr/types";
import { handle_web_sdk } from "@hyperlinkvr/web-sdk-handlers";
import { defineBackground } from "#imports";



import { check_url_allowed, URL_PATTERNS } from "~/util/url_patterns";





// TODO: this whole script deserves a rewrite


export default defineBackground(() => {
    const VR_HOST_URL = "./vr_host.html";

    const VR_HOST_WIDTH = 750;
    const VR_HOST_HEIGHT = 450;

    const storage_engines = {
        local: new ExtensionStorage("local"),
        session: new ExtensionStorage("session"),
        sync: new ExtensionStorage("sync")
    };

    const WINDOW_INTENTS = {
        LOGIN: "/login.html",
        DEVTOOLS: "/devtools.html",
        DEVTOOLS_FORM: "/devtools-form.html",
        DEVTOOLS_WATCH_UI: "/devtools-watch.html"
    } as Record<WindowIntent, string>;

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

    interface ActiveSession {
        tab_id: number;
        window_id: number;
        ready_port: chrome.runtime.Port | null;
        ready_notified: boolean;
    }

    // only one vr host is allowed at a time to prvent sync issues
    let active_session: ActiveSession | null = null;

    // hvr-tab-session ports per tab, so session state (url, dimensions, meta)
    // can be pushed rather than broadcast. broadcasts never reach port listeners.
    const tab_session_ports = new Map<number, Set<chrome.runtime.Port>>();

    // last known meta per tab, replayed when a session port connects so a host
    // launched after the page loaded still learns the page's declared mode
    const tab_meta = new Map<number, string>();

    const post_to_tab_sessions = (tab_id: number, message: unknown) => {
        const ports = tab_session_ports.get(tab_id);
        if (!ports) return;

        for (const port of ports) {
            try {
                port.postMessage(message);
            } catch {
                // dead port, removed by its own onDisconnect
            }
        }
    };

    // navigation consent tracking
    // the extension is the only thing that can legitimately move a session tab between worlds (via HVR_NAVIGATE)
    // a world's own page script can still set window.location directly, bypassing consent, so we track the last consented url per tab
    const consented_url = new Map<number, string>();
    const nav_grace = new Set<number>();

    const awaiting_consent = new Set<number>();

    const strip_hash = (url: string): string => {
        try {
            const u = new URL(url);
            u.hash = "";
            return u.href;
        } catch {
            return url;
        }
    };

    // determine if navigation was authorised
    const classify_nav = (tab_id: number, url: string): boolean => {
        if (active_session?.tab_id !== tab_id) {
            return true;
        }

        const stripped = strip_hash(url);
        const consented = consented_url.get(tab_id);

        // first url we see for the session is where the user launched
        if (consented === undefined) {
            consented_url.set(tab_id, stripped);
            return true;
        }

        // same document (reload / hash / query-only change) already consented
        if (stripped === consented) {
            return true;
        }

        // part of a navigation the extension started (covers 3xx redirect chains)
        if (nav_grace.has(tab_id)) {
            consented_url.set(tab_id, stripped);
            return true;
        }

        // the page navigated itself, not authorised
        return false;
    };

    const classify_document_load = (tab_id: number, url: string | undefined) => {
        if (!url) return;

        const authorised = classify_nav(tab_id, url);
        if (authorised) {
            awaiting_consent.delete(tab_id);
        } else {
            awaiting_consent.add(tab_id);
        }

        console.log("[nav] document load", {
            tab_id,
            url,
            authorised,
            active_tab: active_session?.tab_id ?? null,
            consented: consented_url.get(tab_id) ?? null,
            graced: nav_grace.has(tab_id)
        });

        post_to_tab_sessions(tab_id, {
            type: "HVR_URL_UPDATE",
            tab: tab_id,
            url,
            authorised
        });
    };

    const post_same_document_url = (tab_id: number, url: string) => {
        post_to_tab_sessions(tab_id, {
            type: "HVR_URL_UPDATE",
            tab: tab_id,
            url,
            authorised: true
        });
    };

    const resolve_real_host_url = () => new URL(VR_HOST_URL, location.href).href;
    const REAL_HOST_URL = resolve_real_host_url();

    const launch_vr_host = (tab_id: number) => {
        if (active_session) {
            if (active_session.tab_id === tab_id) {
                // already open for this tab, just refocus it
                chrome.windows.update(active_session.window_id, { focused: true });
                return;
            }

            // a session is already active for a different tab, bring it forward instead
            // TODO: should we offer to transfer the session to this tab?
            console.warn(
                "HyperlinkVR session already active for tab",
                active_session.tab_id,
                "- ignoring launch request for tab",
                tab_id
            );
            chrome.windows.update(active_session.window_id, { focused: true });
            return;
        }

        chrome.windows.create(
            {
                url: `${VR_HOST_URL}?tab=${tab_id}`,
                type: "popup",
                width: VR_HOST_WIDTH,
                height: VR_HOST_HEIGHT
            },
            (win) => {
                if (!win?.id) {
                    console.error("Failed to create VR host window");
                    return;
                }

                active_session = {
                    tab_id,
                    window_id: win.id,
                    ready_port: null
                };
            }
        );
    };

    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create(
            {
                id: "launch-hyperlinkvr",
                title: "Launch HyperlinkVR",
                contexts: ["all"],
                documentUrlPatterns: URL_PATTERNS
            },
            () => {
                if (chrome.runtime.lastError) {
                }
            }
        );
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "launch-hyperlinkvr") {
            if (!check_url_allowed(tab?.url || "")) {
                console.error("URL not allowed for HyperlinkVR:", tab?.url);
                return;
            }

            if (!tab?.id) {
                console.error("No tab id available for HyperlinkVR launch");
                return;
            }

            launch_vr_host(tab.id);
        }
    });

    chrome.action.setBadgeTextColor({
        color: "#fff"
    });

    // only notify if the meta is ready and the vr host has a ready port (and not sent already)
    const try_notify_ready = (tab_id: number) => {
        if (
            !active_session ||
            active_session.tab_id !== tab_id ||
            active_session.ready_port === null
        ) {
            return;
        }

        if (!tab_meta.has(tab_id) || active_session.ready_notified) {
            return;
        }

        // the world's session stays shut until the user consents to this arrival
        if (awaiting_consent.has(tab_id)) {
            return;
        }

        active_session.ready_notified = true;

        console.log("Notifying content script that HyperlinkVR is ready for tab", tab_id, tab_meta.get(tab_id));
        chrome.tabs.sendMessage(tab_id, { type: "HVRSDK_READY" }).catch(() => {
            // probably not ready yet, clear the flag so we can try again later
            if (active_session?.tab_id === tab_id) {
                active_session.ready_notified = false;
            }
        });
    };

    // hvr-ready:<tab_id>: opened by the VR host's WebSDKMessagingProvider for the duration of its RTC session to signal it is ready to receive connections
    // hvr-tab-session:<tab_id>: opened by TabSessionProvider on mount; session state (url, dimensions, meta) is pushed down these ports
    chrome.runtime.onConnect.addListener((port) => {
        const ready_match = port.name.match(/^hvr-ready:(\d+)$/);
        if (ready_match) {
            const tab_id = parseInt(ready_match[1], 10);

            if (!active_session || active_session.tab_id !== tab_id) {
                port.disconnect();
                return;
            }

            active_session.ready_port = port;
            try_notify_ready(tab_id);

            port.onDisconnect.addListener(() => {
                if (active_session?.tab_id === tab_id) {
                    active_session.ready_port = null;

                    // the host may have dropped its ready port without the window closing (e.g. HMR, standard reload), clear the flag to try again later
                    active_session.ready_notified = false;
                }
            });
            return;
        }

        const session_match = port.name.match(/^hvr-tab-session:(\d+)$/);
        if (session_match) {
            const tab_id = parseInt(session_match[1], 10);

            let ports = tab_session_ports.get(tab_id);
            if (!ports) {
                ports = new Set();
                tab_session_ports.set(tab_id, ports);
            }
            ports.add(port);

            port.onDisconnect.addListener(() => {
                const current_ports = tab_session_ports.get(tab_id);
                if (current_ports) {
                    current_ports.delete(port);
                    if (current_ports.size === 0) {
                        tab_session_ports.delete(tab_id);
                    }
                }
            });

            chrome.tabs.get(tab_id, (tab) => {
                if (chrome.runtime.lastError || !tab) return;

                // hydrate a newly connected host: classify the document it's landing on
                // so a reconnect onto an unconsented page keeps the gate up
                classify_document_load(tab_id, tab.url);

                port.postMessage({
                    type: "HVR_DIMENSIONS_UPDATE",
                    tab: tab_id,
                    width: tab.width,
                    height: tab.height
                });

                const cached_meta = tab_meta.get(tab_id);
                if (cached_meta !== undefined) {
                    port.postMessage({
                        type: "HVR_META_UPDATE",
                        tab: tab_id,
                        content: cached_meta,
                        // hydration for a newly connected window, not a new document
                        replay: true
                    });
                }
            });
            return;
        }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        let dropped = true;
        console.table([msg, sender.url]);

        // handle web sdk messages (which expect direct replies for correlation)
        if (msg.action && msg.action.startsWith("HVRSDK_") && msg.target !== "cs") {
            // any rtc lifecycle messages should be deferred to the rtc host instead to facilitate direct connection
            if (msg.action.startsWith("HVRSDK_RTC_")) {
                // authorize + stamp, then forward to the host explicitly.
                // do NOT let the host consume the raw page broadcast anymore.
                if (!active_session || active_session.tab_id !== sender.tab?.id) {
                    console.warn("Rejecting RTC message from non-session tab", sender.tab?.id);
                    dropped = false;
                    return;
                }

                // don't let an unconsented world announce the player into a room
                if (awaiting_consent.has(sender.tab.id)) {
                    console.warn("Rejecting RTC message while awaiting consent", sender.tab.id);
                    dropped = false;
                    return;
                }

                let origin: string | undefined;
                try {
                    origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : undefined);
                } catch { origin = undefined; }

                chrome.runtime.sendMessage({
                    ...msg,
                    target: "vr-host",
                    stamped: true,
                    tab: sender.tab.id,
                    origin
                });

                dropped = false;
                return;
            }

            if (msg.action === "HVRSDK_META") {
                // TODO: should there be an option that calls openPopup to indicate only vr content exists, or is that obnoxious

                if (!sender.tab?.id) {
                    dropped = false;
                    return;
                }

                tab_meta.set(sender.tab.id, msg.content);

                if (msg.content === "supported") {
                    chrome.action.setBadgeText({
                        tabId: sender.tab.id,
                        text: "✓"
                    });
                } else {
                    chrome.action.setBadgeText({
                        tabId: sender.tab.id,
                    });
                }

                post_to_tab_sessions(sender.tab.id, {
                    type: "HVR_META_UPDATE",
                    tab: sender.tab.id,
                    content: msg.content
                });

                try_notify_ready(sender.tab.id);

                dropped = false;

                return;
            }

            // is the VR host currently ready for this sender's tab? (pull, for late-loading content scripts)
            if (msg.action === "HVRSDK_QUERY_READY") {
                if (
                    active_session &&
                    active_session.tab_id === sender.tab?.id &&
                    active_session.ready_port !== null &&
                    !active_session.ready_notified &&
                    !awaiting_consent.has(sender.tab.id)
                ) {
                    active_session.ready_notified = true;
                    chrome.tabs.sendMessage(sender.tab.id!, { type: "HVRSDK_READY" });
                }

                dropped = false;
                return;
            }

            // sdk_forwarder already checks for a user interaction, so fine to accept this
            if (msg.action === "HVRSDK_LAUNCH") {
                const tab_id = sender.tab?.id;
                if (!tab_id) {
                    console.error("No tab id for HVRSDK_LAUNCH");
                    dropped = false;
                    return;
                }

                if (!check_url_allowed(sender.url || "")) {
                    console.error("URL not allowed for HyperlinkVR launch:", sender.url);
                    dropped = false;
                    return;
                }

                launch_vr_host(tab_id);
                sendResponse({ launching: true });
                dropped = false;
                return;
            }

            // hold everything else - crucially auth/identity - until the user consents
            // to this arrival, so merely being navigated to a world can't leak who you are
            if (sender.tab?.id !== undefined && awaiting_consent.has(sender.tab.id)) {
                console.warn("[nav] refusing SDK action while awaiting consent", msg.action, sender.tab.id);
                sendResponse({ error: "Awaiting user consent to enter this world" });
                dropped = false;
                return;
            }

            // otherwise we assume this is for us
            handle_web_sdk({
                message: msg,
                storage: storage_engines
            })
                .then((response) => {
                    if (response) {
                        sendResponse(response);
                    } else {
                        // we were asked to handle a message which should be deferred to the vr host over rtc
                        sendResponse({ error: "Message must be sent over RTC" });
                    }
                })
                .catch((error) => {
                    // TODO: handle errors in web-sdk to prevent freeze
                    console.error(
                        "Error handling SDK message:",
                        msg,
                        "Error:",
                        error
                    );
                    sendResponse({ error: error.message || "Unknown error" });
                });
            dropped = false;

            // tell cs to wait for the response!
            return true;
        }

        // handle messages meant directly for the background script
        // TODO: clean up and use switch/command pattern
        if (msg.action === "HVR_START_STREAM") {
            chrome.tabCapture.getMediaStreamId(
                { targetTabId: msg.tab },
                (stream_id) => {
                    if (stream_id) {
                        chrome.tabs.get(msg.tab, (tab) => {
                            chrome.runtime.sendMessage({
                                type: "HVR_STREAM",
                                stream: stream_id,
                                tab: tab.id
                            });

                            post_to_tab_sessions(tab.id!, {
                                type: "HVR_DIMENSIONS_UPDATE",
                                tab: tab.id,
                                width: tab.width,
                                height: tab.height
                            });

                            post_to_tab_sessions(tab.id!, {
                                type: "HVR_URL_UPDATE",
                                tab: tab.id,
                                url: tab.url
                            });
                        });
                    } else {
                        console.error(
                            "Failed to capture tab:",
                            JSON.stringify(chrome.runtime.lastError)
                        );
                    }
                }
            );

            dropped = false;
        } else if (msg.action === "HVR_LAUNCH") {
            if (!msg.tab) {
                console.error("No tab specified for HVR_LAUNCH");
                return;
            }

            chrome.tabs.get(msg.tab, (tab) => {
                if (!check_url_allowed(tab.url || "")) {
                    console.error("URL not allowed for HyperlinkVR:", tab.url);
                    return;
                }

                launch_vr_host(tab.id!);
            });

            dropped = false;
        } else if (msg.action === "HVR_CLICK") {
            handle_click(msg);
            dropped = false;
        } else if (msg.action === "HVR_CREATE_WINDOW") {
            const window_url = get_window_url(msg.intent, msg.args);
            if (!window_url) {
                console.error(
                    "Failed to create window: unknown intent",
                    msg.intent
                );
                return;
            }

            chrome.windows.create({
                url: window_url,
                type: msg.type || "popup",
                width: msg.width || 800,
                height: msg.height || 600
            });

            dropped = false;
        } else if (msg.action === "HVR_NAVIGATE") {
            if (!msg.url || !msg.tab) {
                console.error("No url or tab specified for HVR_NAVIGATE");
                return;
            }

            // this navigation is coming through the extension, so trust the load it triggers
            nav_grace.add(msg.tab);

            // tabs.onUpdated fires with the new url and pushes it down the session port
            chrome.tabs.update(msg.tab, { url: msg.url });

            dropped = false;
        } else if (msg.action === "HVR_NAV_CONSENT") {
            if (!msg.tab || !msg.url) {
                console.error("No tab or url specified for HVR_NAV_CONSENT");
                return;
            }

            // the user approved this arrival, consent is not sticky and will be re-checked on the next unauthorised navigation
            awaiting_consent.delete(msg.tab);
            try_notify_ready(msg.tab);

            dropped = false;
        } else if (msg.action === "HVR_NAV_BACK") {
            if (!msg.tab) {
                console.error("No tab specified for HVR_NAV_BACK");
                return;
            }

            // returning to the previous entry (the world we came from)
            // it's still the consented url, but grace it too in case it redirects on the way back
            nav_grace.add(msg.tab);
            chrome.tabs.goBack(msg.tab).catch((err) => {
                console.error("Failed to go back for HVR_NAV_BACK:", err);
            });

            dropped = false;
        }

        // TODO: subscription based routing
        if (msg.target === "cs" && sender.url?.startsWith(REAL_HOST_URL)) {
            chrome.tabs.sendMessage(msg.tab, msg);
            dropped = false;
        }

        if (
            msg.target === "vr-host" &&
            !sender.url?.startsWith(REAL_HOST_URL)
        ) {
            chrome.runtime.sendMessage(msg);
            dropped = false;
        }

        if (dropped) {
            console.warn("Dropped message:", msg, "from sender:", sender.url);
        }
    });

    // alert the vr host of resizes of the active tab
    chrome.windows.onBoundsChanged.addListener(async (window) => {
        const [tab] = await chrome.tabs.query({
            active: true,
            windowId: window.id
        });

        if (tab && tab.id) {
            post_to_tab_sessions(tab.id, {
                type: "HVR_DIMENSIONS_UPDATE",
                tab: tab.id,
                width: tab.width,
                height: tab.height
            });
        }
    });

    // alert the vr host of changes in url
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === "loading") {
            // a real document is committing (navigation or reload). this fires before
            // the page's content scripts run, so gating here beats the QUERY_READY race.
            // reloads may omit changeInfo.url, so classify off tab.url.
            if (active_session?.tab_id === tabId) {
                active_session.ready_notified = false;
            }
            classify_document_load(tabId, tab.url);
        } else if (changeInfo.url) {
            // url changed without a document load = same-document (hash / pushState).
            // inform the host but leave the consent gate untouched.
            post_same_document_url(tabId, changeInfo.url);
        }

        // the document finished loading: any extension-initiated grace is spent, so a
        // later navigation is the page moving itself and must be re-checked
        if (changeInfo.status === "complete") {
            nav_grace.delete(tabId);
        }
    });

    // alert the vr host of the session closing
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        post_to_tab_sessions(tabId, {
            type: "HVR_TAB_CLOSED",
            tab: tabId
        });

        tab_meta.delete(tabId);
        consented_url.delete(tabId);
        nav_grace.delete(tabId);
        awaiting_consent.delete(tabId);

        if (active_session?.tab_id === tabId) {
            active_session = null;
        }
    });

    // clear the active session if its window is closed directly
    chrome.windows.onRemoved.addListener((window_id) => {
        if (active_session?.window_id === window_id) {
            active_session = null;
        }
    });

    const handle_click = (msg: any) => {
        chrome.storage.sync.get("settings.use_debug_input", (data) => {
            const use_debug_input =
                data["settings.use_debug_input"] === "true" || false;

            if (use_debug_input) {
                console.error("not yet implemented!!!!!");
            } else {
                // forward event to the active tab's content script
                chrome.tabs.sendMessage(msg.tab, msg);
            }
        });
    };

    // TODO: handle debugger attachment in response to setting changing, only if activated

    // TODO: tab hopping
});

// TODO: should some of this be abstracted to a package? i think the sdk handling mostly could be when it comes around. anything not requiring special backend privileges can be abstracted