import type { MessageChannel, MessageEngine, SenderInfo, StorageEngine, StorageKind } from "@hyperlinkvr/core";
import type { ActionMessage, EventMessage, Message, NamedEvent, NamedReply, WebSDKActionMessage, WindowIntent } from "@hyperlinkvr/types";


import { handle_web_sdk } from "@hyperlinkvr/web-sdk-handlers";


// TODO: rewrite a bit more to remove some extension related assumptions and overall slop

// TODO: unite this with storageenginescontexttype
type StorageEngines<K extends StorageKind = StorageKind> = {
    [P in K]: StorageEngine<P>;
};

const VR_HOST_WIDTH = 750;
const VR_HOST_HEIGHT = 450;

const strip_hash = (url: string): string => {
    try {
        const u = new URL(url);
        u.hash = "";
        return u.href;
    } catch {
        return url;
    }
};

interface ActiveSession {
    tab_id: number;
    window_id: number;
    ready_port: MessageChannel<never, never> | null;
    ready_notified: boolean;
}

export abstract class BackendIntegrationEngine {
    abstract send_message_to_tab(tab_id: number, message: Message): Promise<any>;
    abstract get_tab_info(tab_id: number): Promise<{url?: string; width?: number; height?: number}>;
    abstract navigate_tab(tab_id: number, new_url: string): void;
    abstract navigate_tab_back(tab_id: number): void;

    // should return window id
    abstract create_window(params: {intent: WindowIntent; args?: Record<string, any>; width?: number; height?: number}): Promise<number>;
    abstract focus_window(window_id: number): void;

    abstract is_from_vr_host(sender: SenderInfo): boolean;

    abstract is_url_launchable?(url: string): boolean;

    // should return stream id
    abstract start_screenshare?(tab_id: number): Promise<string>;
}

interface Engines {
    storage: StorageEngines;
    message: MessageEngine;
    backend_integration: BackendIntegrationEngine;
}

const is_sdk_message = (msg: Message): boolean => {
    return (
        ("action" in msg && msg.action && msg.action.startsWith("HVRSDK_")) ||
        ("type" in msg && msg.type && msg.type.startsWith("HVRSDK_")) ||
        ("for" in msg && msg.for && msg.for.startsWith("HVRSDK_"))
    );
};

const has_action = (msg: Message): msg is ActionMessage => "action" in msg;
const is_event = (msg: Message): msg is EventMessage => "type" in msg;
const is_web_sdk_action = (msg: Message): msg is WebSDKActionMessage =>
    "action" in msg &&
    typeof msg.action === "string" &&
    msg.action.startsWith("HVRSDK_");

export type HookPhase = "before" | /*"after" |*/ "alongside";
export type HookPhasedEvent = "message" | "connect";
export type HookPhasedSpec = `${HookPhase}-${HookPhasedEvent}`;

export type HookOneshotEvent = "meta";
export type HookOneshotSpec = `on-${HookOneshotEvent}`;

export type HookEvent = HookPhasedEvent | HookOneshotEvent;
export type HookSpec = HookPhasedSpec | HookOneshotSpec;

export class Backend {
    readonly #engines: Engines;
    readonly #hooks: Partial<Record<HookSpec, Set<Function>>>;

    constructor(
        engines: Engines,
        hooks: Partial<Record<HookSpec, Set<Function>>> = {}
    ) {
        this.#engines = engines;

        // bind listeners
        this.#engines.message.on_connect(undefined, this.#on_connect);
        this.#engines.message.listen(this.#on_message);

        this.#hooks = hooks;
        Object.entries(hooks).forEach(([spec, callbacks]) => {
            if (spec.startsWith("alongside")) {
                callbacks.forEach((callback) =>
                    this.#bind_alongside_hook(
                        spec.replace("alongside-", "") as HookPhasedEvent,
                        callback
                    )
                );
            }
        });
    }

    #bind_alongside_hook = (event: HookPhasedEvent, callback: Function) => {
        switch (event) {
            case "message":
                this.#engines.message.listen(callback as any);
                break;
            case "connect":
                this.#engines.message.on_connect(undefined, callback as any);
                break;
        }
    };

    add_hook = (spec: HookSpec, callback: Function) => {
        if (!this.#hooks[spec]) {
            this.#hooks[spec] = new Set<Function>();
        }
        this.#hooks[spec]!.add(callback);

        if (spec.startsWith("alongside")) {
            this.#bind_alongside_hook(
                spec.replace("alongside-", "") as HookPhasedEvent,
                callback
            );
        }
    };

    // only one vr host is allowed at a time to prevent sync issues
    #active_session: ActiveSession | null = null;

    // hvr-tab-session ports per tab, so session state (url, dimensions, meta)
    // can be pushed rather than broadcast. broadcasts never reach port listeners.
    readonly #tab_session_ports = new Map<
        number,
        Set<MessageChannel<Message, Message>>
    >();

    // last known meta per tab, replayed when a session port connects so a host
    // launched after the page loaded still learns the page's declared mode
    readonly #tab_meta = new Map<number, "supported" | "defer" | "disable">();

    // message spying is presence-driven: it's on exactly while a spy window holds an
    // hvr-spy port open, and off the moment that port disconnects (close or crash).
    readonly #spy_ports = new Set<
        MessageChannel<NamedEvent<"HVR_SPY">, NamedReply<"HVR_SPY">>
    >();

    #is_spy_active = () => this.#spy_ports.size > 0;

    #spy_message = (message: any, to: "vr-host" | "cs") => {
        if (!this.#is_spy_active() || message?.type === "HVR_SPY") return;
        this.#post_to_spy_ports({
            type: "HVR_SPY",
            message,
            context: is_sdk_message(message) ? "sdk" : "backend",
            from: "backend",
            to,
            ts: Date.now()
        });
    };

    send_message = (
        message: Message,
        to: "vr-host" | "cs",
        tab_id?: number
    ): Promise<any> => {
        this.#spy_message(message, to);

        return tab_id !== undefined
            ? this.#engines.backend_integration.send_message_to_tab(tab_id, message)
            : this.#engines.message.send(message);
    };

    // spy a reply before handing it back to the sender (always a content script)
    wrap_response = (response: any) => {
        if (response) {
            this.#spy_message(response, "cs");
        }

        return response;
    };

    // the background is the spy hub: every HVR_SPY event (its own, and ones forwarded
    // from the vr-host) is delivered only down the open spy port(s), never broadcast
    #post_to_spy_ports = (event: NamedEvent<"HVR_SPY">) => {
        for (const port of this.#spy_ports) {
            try {
                port.send(event);
            } catch {
                // dead port, removed by its own onDisconnect
            }
        }
    };

    // tell every connected vr-host session whether a spy is currently watching, so it
    // can gate its own (data channel) spy emissions to match
    #broadcast_spy_state = () => {
        const message = {
            type: "HVR_SPY_STATE",
            active: this.#is_spy_active()
        } satisfies NamedEvent<"HVR_SPY_STATE">;
        for (const ports of this.#tab_session_ports.values()) {
            for (const port of ports) {
                try {
                    port.send(message);
                } catch {
                    // dead port, removed by its own onDisconnect
                }
            }
        }
    };

    #get_sender_spy_info = (sender: SenderInfo) => {
        if (this.#engines.backend_integration.is_from_vr_host(sender)) {
            return "vr-host";
        }

        return {
            tab: sender.tab_id,
            url: sender.url
        };
    };

    #post_to_tab_sessions = (tab_id: number, message: Message) => {
        const ports = this.#tab_session_ports.get(tab_id);
        if (!ports) return;

        // session ports are opened by the vr-host's TabSessionProvider
        this.#spy_message(message, "vr-host");

        for (const port of ports) {
            try {
                port.send(message);
            } catch {
                // dead port, removed by its own onDisconnect
            }
        }
    };

    // navigation consent tracking
    // the extension is the only thing that can legitimately move a session tab between worlds (via HVR_NAVIGATE)
    // a world's own page script can still set window.location directly, bypassing consent, so we track the last consented url per tab
    readonly #consented_url = new Map<number, string>();
    readonly #nav_grace = new Set<number>();

    readonly #awaiting_consent = new Set<number>();

    // determine if navigation was authorised
    #classify_nav = (tab_id: number, url: string): boolean => {
        if (this.#active_session?.tab_id !== tab_id) {
            return true;
        }

        const stripped = strip_hash(url);
        const consented = this.#consented_url.get(tab_id);

        // first url we see for the session is where the user launched
        if (consented === undefined) {
            this.#consented_url.set(tab_id, stripped);
            return true;
        }

        // same document (reload / hash / query-only change) already consented
        if (stripped === consented) {
            return true;
        }

        // part of a navigation the extension started (covers 3xx redirect chains)
        if (this.#nav_grace.has(tab_id)) {
            this.#consented_url.set(tab_id, stripped);
            return true;
        }

        // the page navigated itself, not authorised
        return false;
    };

    #classify_document_load = (tab_id: number, url: string | undefined) => {
        if (!url) return;

        const authorised = this.#classify_nav(tab_id, url);
        if (authorised) {
            this.#awaiting_consent.delete(tab_id);
        } else {
            this.#awaiting_consent.add(tab_id);
        }

        console.log("[nav] document load", {
            tab_id,
            url,
            authorised,
            active_tab: this.#active_session?.tab_id ?? null,
            consented: this.#consented_url.get(tab_id) ?? null,
            graced: this.#nav_grace.has(tab_id)
        });

        this.#post_to_tab_sessions(tab_id, {
            type: "HVR_URL_UPDATE",
            tab: tab_id,
            url,
            authorised
        });
    };

    launch_vr_host = async (tab_id: number) => {
        if (this.#active_session) {
            if (this.#active_session.tab_id === tab_id) {
                // already open for this tab, just refocus it
                this.#engines.backend_integration.focus_window(this.#active_session.window_id);
                return;
            }

            // a session is already active for a different tab, bring it forward instead
            // TODO: should we offer to transfer the session to this tab?
            console.warn(
                "HyperlinkVR session already active for tab",
                this.#active_session.tab_id,
                "- ignoring launch request for tab",
                tab_id
            );
            this.#engines.backend_integration.focus_window(this.#active_session.window_id);
            return;
        }

        const window_id = await this.#engines.backend_integration.create_window({intent: "VR_HOST", args: {tab: tab_id}, width: VR_HOST_WIDTH, height: VR_HOST_HEIGHT});
        this.#active_session = {
            tab_id,
            window_id,
            ready_port: null,
            ready_notified: false
        };
    };

    // only notify if the meta is ready and the vr host has a ready port (and not sent already)
    #try_notify_ready = (tab_id: number) => {
        if (
            !this.#active_session ||
            this.#active_session.tab_id !== tab_id ||
            this.#active_session.ready_port === null
        ) {
            return;
        }

        if (
            !this.#tab_meta.has(tab_id) ||
            this.#active_session.ready_notified
        ) {
            return;
        }

        // the world's session stays shut until the user consents to this arrival
        if (this.#awaiting_consent.has(tab_id)) {
            return;
        }

        this.#active_session.ready_notified = true;

        console.log(
            "Notifying content script that HyperlinkVR is ready for tab",
            tab_id,
            this.#tab_meta.get(tab_id)
        );
        this.send_message({ type: "HVRSDK_READY" }, "cs", tab_id).catch(() => {
            // probably not ready yet, clear the flag so we can try again later
            if (this.#active_session?.tab_id === tab_id) {
                this.#active_session.ready_notified = false;
            }
        });
    };

    #handle_click = (msg: any) => {
        this.#engines.storage.local
            .get<string>("settings.use_debug_input")
            .then((value) => {
                const use_debug_input = value === "true" || false;

                if (use_debug_input) {
                    console.error("not yet implemented!!!!!");
                } else {
                    // forward event to the active tab's content script
                    this.send_message(msg, "cs", msg.tab);
                }
            });
    };

    // hvr-ready:<tab_id>: opened by the VR host's WebSDKMessagingProvider for the duration of its RTC session to signal it is ready to receive connections
    // hvr-tab-session:<tab_id>: opened by TabSessionProvider on mount; session state (url, dimensions, meta) is pushed down these ports
    #on_connect = async (channel: MessageChannel<Message, Message>) => {
        const before_hooks = Array.from(this.#hooks["before-message"] ?? []);
        const before_hook_runs = await Promise.all(
            before_hooks.map((h) => h(channel))
        );
        if (before_hook_runs.some((v) => v === false)) {
            // vetod by hook
            return;
        }

        // hvr-spy: opened by a devtools spy window for its lifetime. its mere presence
        // turns spying on; its disconnect (window closed or crashed) turns it back off.
        // TODO: might be cleaner to bind as separate on_connect listener, but the wildcard is fine for now
        if (channel.name === "hvr-spy") {
            this.#spy_ports.add(
                channel as MessageChannel<
                    NamedEvent<"HVR_SPY">,
                    NamedReply<"HVR_SPY">
                >
            );
            this.#broadcast_spy_state();

            channel.on_disconnect(() => {
                this.#spy_ports.delete(
                    channel as MessageChannel<
                        NamedEvent<"HVR_SPY">,
                        NamedReply<"HVR_SPY">
                    >
                );
                this.#broadcast_spy_state();
            });
            return;
        }

        const ready_match = channel.name.match(/^hvr-ready:(\d+)$/);
        if (ready_match && ready_match[1]) {
            const tab_id = parseInt(ready_match[1], 10);

            if (
                !this.#active_session ||
                this.#active_session.tab_id !== tab_id
            ) {
                channel.disconnect();
                return;
            }

            this.#active_session.ready_port = channel as MessageChannel<
                never,
                never
            >;
            this.#try_notify_ready(tab_id);

            channel.on_disconnect(() => {
                if (this.#active_session?.tab_id === tab_id) {
                    this.#active_session.ready_port = null;

                    // the host may have dropped its ready port without the window closing (e.g. HMR, standard reload), clear the flag to try again later
                    this.#active_session.ready_notified = false;
                }
            });
            return;
        }

        const session_match = channel.name.match(/^hvr-tab-session:(\d+)$/);
        if (session_match && session_match[1]) {
            const tab_id = parseInt(session_match[1], 10);

            let ports = this.#tab_session_ports.get(tab_id);
            if (!ports) {
                ports = new Set();
                this.#tab_session_ports.set(tab_id, ports);
            }
            ports.add(channel);

            channel.on_disconnect(() => {
                const current_ports = this.#tab_session_ports.get(tab_id);
                if (current_ports) {
                    current_ports.delete(channel);
                    if (current_ports.size === 0) {
                        this.#tab_session_ports.delete(tab_id);
                    }
                }
            });

            // a host mounting after a spy window is already open needs the current state
            channel.send({
                type: "HVR_SPY_STATE",
                active: this.#is_spy_active()
            });

            const tab = await this.#engines.backend_integration.get_tab_info(tab_id);

            // hydrate a newly connected host: classify the document it's landing on
            // so a reconnect onto an unconsented page keeps the gate up
            this.#classify_document_load(tab_id, tab.url);

            const dimensions_update = {
                type: "HVR_DIMENSIONS_UPDATE",
                tab: tab_id,
                width: tab.width ?? 0,
                height: tab.height ?? 0
            } satisfies NamedEvent<"HVR_DIMENSIONS_UPDATE">;

            this.#spy_message(dimensions_update, "vr-host");
            channel.send(dimensions_update);

            const cached_meta = this.#tab_meta.get(tab_id);
            if (cached_meta !== undefined) {
                const meta_update = {
                    type: "HVR_META_UPDATE",
                    tab: tab_id,
                    content: cached_meta,
                    // hydration for a newly connected window, not a new document
                    replay: true
                } satisfies NamedEvent<"HVR_META_UPDATE">;
                this.#spy_message(meta_update, "vr-host");
                channel.send(meta_update);
            }
            return;
        }
    };

    // TODO: this needs to be hugely decomposed, probably using a command registry
    #on_message = async (msg: Message, sender: SenderInfo) =>
        this.wrap_response(
            await (async () => {
                const before_hooks = Array.from(
                    this.#hooks["before-message"] ?? []
                );
                const before_hook_runs = await Promise.all(
                    before_hooks.map((h) => h(msg, sender))
                );
                if (before_hook_runs.some((v) => v === false)) {
                    // vetod by hook
                    return;
                }

                let dropped = true;
                console.table([msg, sender.url]);

                // spy events emitted by other contexts (the vr-host's data channel) arrive here
                // so the background can funnel them down the spy port(s); never processed further
                if (is_event(msg) && msg.type === "HVR_SPY") {
                    this.#post_to_spy_ports(msg);
                    return;
                }

                if (this.#is_spy_active()) {
                    this.#post_to_spy_ports({
                        type: "HVR_SPY",
                        message: msg,
                        context: is_sdk_message(msg) ? "sdk" : "backend",
                        from: this.#get_sender_spy_info(sender),
                        // the message has arrived here; any onward hop is a separate outbound spy event
                        to: "backend",
                        ts: Date.now()
                    });
                }

                // handle web sdk messages (which expect direct replies for correlation)
                if (is_web_sdk_action(msg) && msg.target !== "cs") {
                    // any rtc lifecycle messages should be deferred to the rtc host instead to facilitate direct connection
                    if (msg.action.startsWith("HVRSDK_RTC_")) {
                        // authorize + stamp, then forward to the host explicitly.
                        // do NOT let the host consume the raw page broadcast anymore.
                        if (
                            !this.#active_session ||
                            this.#active_session.tab_id !== sender.tab_id
                        ) {
                            console.warn(
                                "Rejecting RTC message from non-session tab",
                                sender.tab_id
                            );
                            dropped = false;
                            return;
                        }

                        // don't let an unconsented world announce the player into a room
                        if (this.#awaiting_consent.has(sender.tab_id)) {
                            console.warn(
                                "Rejecting RTC message while awaiting consent",
                                sender.tab_id
                            );
                            dropped = false;
                            return;
                        }

                        let origin: string | undefined;
                        try {
                            origin =
                                sender.origin ??
                                (sender.url
                                    ? new URL(sender.url).origin
                                    : undefined);
                        } catch {
                            origin = undefined;
                        }

                        this.send_message(
                            {
                                ...msg,
                                target: "vr-host",
                                stamped: true,
                                tab: sender.tab_id,
                                origin
                            },
                            "vr-host"
                        );

                        dropped = false;
                        return;
                    }

                    if (msg.action === "HVRSDK_META") {
                        // TODO: should there be an option that calls openPopup to indicate only vr content exists, or is that obnoxious

                        if (!sender.tab_id) {
                            dropped = false;
                            return;
                        }

                        this.#tab_meta.set(sender.tab_id, msg.content);

                        this.#hooks["on-meta"]?.forEach(h => h(msg.content, sender.tab_id));

                        this.#post_to_tab_sessions(sender.tab_id, {
                            type: "HVR_META_UPDATE",
                            tab: sender.tab_id,
                            content: msg.content
                        });

                        this.#try_notify_ready(sender.tab_id);

                        dropped = false;

                        return;
                    }

                    // is the VR host currently ready for this sender's tab? (pull, for late-loading content scripts)
                    if (msg.action === "HVRSDK_QUERY_READY") {
                        if (
                            this.#active_session &&
                            this.#active_session.tab_id === sender.tab_id &&
                            this.#active_session.ready_port !== null &&
                            !this.#active_session.ready_notified &&
                            !this.#awaiting_consent.has(sender.tab_id)
                        ) {
                            this.#active_session.ready_notified = true;
                            this.send_message(
                                { type: "HVRSDK_READY" },
                                "cs",
                                sender.tab_id!
                            );
                        }

                        dropped = false;
                        return;
                    }

                    // sdk_forwarder already checks for a user interaction, so fine to accept this
                    if (msg.action === "HVRSDK_LAUNCH") {
                        const tab_id = sender.tab_id;
                        if (!tab_id) {
                            console.error("No tab id for HVRSDK_LAUNCH");
                            dropped = false;
                            return;
                        }

                        // if no url criteria is defined, its always allowed, otherwise evaluate crtieria
                        if (this.#engines.backend_integration.is_url_launchable && !this.#engines.backend_integration.is_url_launchable(sender.url || "")) {
                            console.error(
                                "URL not allowed for HyperlinkVR launch:",
                                sender.url
                            );
                            dropped = false;
                            return;
                        }

                        await this.launch_vr_host(tab_id);

                        dropped = false;
                        return { launching: true };
                    }

                    // hold everything else - crucially auth/identity - until the user consents
                    // to this arrival, so merely being navigated to a world can't leak who you are
                    if (
                        sender.tab_id !== undefined &&
                        this.#awaiting_consent.has(sender.tab_id)
                    ) {
                        console.warn(
                            "[nav] refusing SDK action while awaiting consent",
                            msg.action,
                            sender.tab_id
                        );

                        dropped = false;
                        return {
                            error: "Awaiting user consent to enter this world"
                        };
                    }

                    // otherwise we assume this is for us
                    try {
                        const response = await handle_web_sdk({
                            message: msg,
                            storage: this.#engines.storage
                        });

                        dropped = false;
                        if (response) {
                            return response;
                        } else {
                            // we were asked to handle a message which should be deferred to the vr host over rtc
                            return {
                                error: "Message must be sent over RTC"
                            };
                        }
                    } catch (error) {
                        // TODO: handle errors in web-sdk to prevent freeze
                        console.error(
                            "Error handling SDK message:",
                            msg,
                            "Error:",
                            error
                        );

                        dropped = false;
                        return {
                            error:
                                (error instanceof Error && error.message) ||
                                "Unknown error"
                        };
                    }

                    // tell cs to wait for the response!
                    return true;
                }

                // handle messages meant directly for the background script
                // TODO: clean up and use switch/command pattern
                if (has_action(msg) && msg.action === "HVR_START_STREAM") {
                    if (!this.#engines.backend_integration.start_screenshare) {
                        return {
                            success: false,
                            error: "This platform does not support tab streaming"
                        }
                    }

                    const stream_id = await this.#engines.backend_integration.start_screenshare(msg.tab);
                    const tab = await this.#engines.backend_integration.get_tab_info(msg.tab);
                    this.send_message(
                        {
                            type: "HVR_STREAM",
                            stream: stream_id,
                            tab: msg.tab
                        },
                        "vr-host"
                    );

                    this.#post_to_tab_sessions(msg.tab, {
                        type: "HVR_DIMENSIONS_UPDATE",
                        tab: msg.tab,
                        width: tab.width ?? 0,
                        height: tab.height ?? 0
                    });

                    if (tab.url !== undefined) {
                        this.#post_to_tab_sessions(msg.tab, {
                            type: "HVR_URL_UPDATE",
                            tab: msg.tab,
                            url: tab.url
                        });
                    }

                    dropped = false;
                } else if (has_action(msg) && msg.action === "HVR_LAUNCH") {
                    if (!("tab" in msg) || !msg.tab) {
                        console.error("No tab specified for HVR_LAUNCH");
                        return;
                    }

                    const tab = await this.#engines.backend_integration.get_tab_info(msg.tab);
                    if (this.#engines.backend_integration.is_url_launchable && !this.#engines.backend_integration.is_url_launchable(tab.url || "")) {
                        console.error(
                            "URL not allowed for HyperlinkVR:",
                            tab.url
                        );
                        return;
                    }

                    this.launch_vr_host(msg.tab);

                    dropped = false;
                } else if (has_action(msg) && msg.action === "HVR_CLICK") {
                    this.#handle_click(msg);
                    dropped = false;
                } else if (has_action(msg) && msg.action === "HVR_CREATE_WINDOW") {
                    this.#engines.backend_integration.create_window(msg);
                    dropped = false;
                } else if (has_action(msg) && msg.action === "HVR_NAVIGATE") {
                    if (!msg.url || !msg.tab) {
                        console.error(
                            "No url or tab specified for HVR_NAVIGATE"
                        );
                        return;
                    }

                    // this navigation is coming through the extension, so trust the load it triggers
                    this.#nav_grace.add(msg.tab);

                    this.#engines.backend_integration.navigate_tab(msg.tab, msg.url);

                    dropped = false;
                } else if (has_action(msg) && msg.action === "HVR_NAV_CONSENT") {
                    if (!msg.tab || !msg.url) {
                        console.error(
                            "No tab or url specified for HVR_NAV_CONSENT"
                        );
                        return;
                    }

                    // the user approved this arrival, consent is not sticky and will be re-checked on the next unauthorised navigation
                    this.#awaiting_consent.delete(msg.tab);
                    this.#try_notify_ready(msg.tab);

                    dropped = false;
                } else if (has_action(msg) && msg.action === "HVR_NAV_BACK") {
                    if (!msg.tab) {
                        console.error("No tab specified for HVR_NAV_BACK");
                        return;
                    }

                    // returning to the previous entry (the world we came from)
                    // it's still the consented url, but grace it too in case it redirects on the way back
                    this.#nav_grace.add(msg.tab);
                    this.#engines.backend_integration.navigate_tab_back(msg.tab);

                    dropped = false;
                }

                // TODO: subscription based routing
                if (
                    msg.target === "cs" &&
                    this.#engines.backend_integration.is_from_vr_host(sender)
                ) {
                    this.send_message(msg, "cs", msg.tab);
                    dropped = false;
                }

                if (
                    msg.target === "vr-host" &&
                    !this.#engines.backend_integration.is_from_vr_host(sender)
                ) {
                    this.send_message(msg, "vr-host");
                    dropped = false;
                }

                if (dropped) {
                    console.warn(
                        "Dropped message:",
                        msg,
                        "from sender:",
                        sender.url
                    );
                }
            })()
        );

    notify_dimensions_changed = (tab: {
        id: number;
        width: number;
        height: number;
    }) => {
        this.#post_to_tab_sessions(tab.id, {
            type: "HVR_DIMENSIONS_UPDATE",
            tab: tab.id,
            width: tab.width,
            height: tab.height
        });
    };

    notify_navigation = (tab: { id?: number; url?: string }) => {
        // a real document is committing (navigation or reload). this fires before
        // the page's content scripts run, so gating here beats the QUERY_READY race.
        // reloads may omit changeInfo.url, so classify off tab.url.
        if (tab.id === undefined) return;

        if (this.#active_session?.tab_id === tab.id) {
            this.#active_session.ready_notified = false;
        }
        this.#classify_document_load(tab.id, tab.url);
    };

    notify_non_navigation_url_change = (tab_id: number, new_url: string) => {
        this.#post_to_tab_sessions(tab_id, {
            type: "HVR_URL_UPDATE",
            tab: tab_id,
            url: new_url,
            authorised: true
        });
    };

    notify_document_finished_loading = (tab_id: number) => {
        // the document finished loading: any extension-initiated grace is spent, so a
        // later navigation is the page moving itself and must be re-checked
        this.#nav_grace.delete(tab_id);
    }

    notify_tab_closed = (tab_id: number) => {
        this.#post_to_tab_sessions(tab_id, {
            type: "HVR_TAB_CLOSED",
            tab: tab_id
        });

        this.#tab_meta.delete(tab_id);
        this.#consented_url.delete(tab_id);
        this.#nav_grace.delete(tab_id);
        this.#awaiting_consent.delete(tab_id);

        if (this.#active_session?.tab_id === tab_id) {
            this.#active_session = null;
        }
    }

    notify_window_closed = (window_id: number) => {
        // clear the active session if its window is closed directly
        if (this.#active_session?.window_id === window_id) {
            this.#active_session = null;
        }
    }
}

// TODO: handle debugger attachment in response to setting changing, only if activated

// TODO: tab hopping
