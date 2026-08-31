import { DiscordRPCActivity, DiscordRPCEngine } from "@hyperlinkvr/core";
import browser from "webextension-polyfill";

const CLIENT_ID = "1543786199452229652";
const NATIVE_HOST_NAME = "surf.hyperlink.discord_rpc";

export class ExtensionDiscordRPCEngine extends DiscordRPCEngine {
    #port: browser.Runtime.Port | null = null;
    #current_activity: DiscordRPCActivity | null = null;

    async request_permission(): Promise<boolean> {
        return browser.permissions.request({
            permissions: ["nativeMessaging"]
        });
    }

    async has_permission(): Promise<boolean> {
        return browser.permissions.contains({
            permissions: ["nativeMessaging"]
        });
    }

    async connect(): Promise<void> {
        const permitted = await this.has_permission();
        if (!permitted) {
            console.warn("Cannot connect. Missing 'nativeMessaging' permission.");
            return;
        }

        console.log("Connecting to Native Messaging bridge...");

        // TODO: might need reload
        try {
            this.#port = browser.runtime.connectNative(NATIVE_HOST_NAME);

            this.#port.onDisconnect.addListener(() => {
                console.warn("Native Messaging host disconnected.", browser.runtime.lastError?.message);
                this.#port = null;
            });

            console.log("Discord RPC Native Engine connected successfully.");

            if (this.#current_activity) {
                this.#flush_presence_update();
            }
        } catch (err) {
            console.error("Failed to establish Native Messaging connection:", err);
            this.#port = null;
            throw err;
        }
    }

    async disconnect(): Promise<void> {
        this.#current_activity = null;

        if (this.#port) {
            this.#port.disconnect();
            this.#port = null;
        }

        console.log("Disconnected from native messaging.");
    }

    async is_connected(): Promise<boolean> {
        return this.#port !== null;
    }

    async set_activity(activity: DiscordRPCActivity): Promise<void> {
        this.#current_activity = activity;

        if (!await this.is_connected()) {
            console.warn("Cannot set activity. Native Messaging host is not connected.");
            return;
        }

        this.#flush_presence_update();
        console.log("Activity updated:", activity);
    }

    async clear_activity(): Promise<void> {
        this.#current_activity = null;
        if (this.#port) {
            this.#send_payload(null);
        }
    }

    override get setup() {
        return {
            text: "Download and install the bridge application below to connect HyperlinkVR to Discord Rich Presence.\n\nOnce you click confirm, we'll ask for permission to talk to the application.",
            download: "https://hyperlink.surf/download/discord_rpc"
        }
    }

    #flush_presence_update(): void {
        if (!this.#port || !this.#current_activity) {
            return;
        }

        // TODO: defaults should be set on abstract class, not in impls
        const activity_payload = {
            details: this.#current_activity.details || undefined,
            state: this.#current_activity.state || undefined,
            timestamps: this.#current_activity.timestamps || {
                start: Date.now()
            },
            assets: this.#current_activity.assets || {
                large_image: "hyperlinkvr_logo",
                large_text: "HyperlinkVR"
            },
            buttons: this.#current_activity.buttons || undefined
        };

        this.#send_payload(activity_payload);
    }

    #send_payload(activity: unknown): void {
        if (this.#port) {
            console.log("Dispatching payload to Native Messaging host:", activity);
            this.#port.postMessage({
                client_id: CLIENT_ID,
                activity
            });
        }
    }
}
