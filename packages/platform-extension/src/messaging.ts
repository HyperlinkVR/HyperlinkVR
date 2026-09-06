import type { MessageChannel, MessageEngine, SenderInfo } from "@hyperlinkvr/core";
import browser, { Runtime } from "webextension-polyfill";

import MessageSender = Runtime.MessageSender;


export class ExtensionMessageEngine implements MessageEngine {
    async send<Tx, Rx>(action: Tx): Promise<Rx> {
        return browser.runtime.sendMessage(action);
    }

    listen<Rx, Tx>(handler: (event: Rx, sender: SenderInfo) => Promise<Tx | void>): () => void {
        const listener = (message: any, sender: MessageSender, reply: (message: any) => void): true => {
            handler(message as Rx, {...sender, tab_id: sender.tab?.id}).then(response => {
                if (response) {
                    reply(response);
                }
            })

            // tell browser the response will be async if any
            return true;
        };

        browser.runtime.onMessage.addListener(listener);
        return () => browser.runtime.onMessage.removeListener(listener);
    }

    connect<Tx, Rx>(channel_name: string): MessageChannel<Tx, Rx> {
        const port = browser.runtime.connect({ name: channel_name });

        return {
            name: channel_name,
            send: async (payload: Tx) => {
                port.postMessage(payload);
            },
            listen: (handler) => {
                const listener = (msg: any) => handler(msg as Rx);
                port.onMessage.addListener(listener);
                return () => port.onMessage.removeListener(listener);
            },
            on_disconnect: (handler) => {
                port.onDisconnect.addListener(handler);
                return () => port.onDisconnect.removeListener(handler);
            },
            disconnect: () => port.disconnect()
        };
    }

    on_connect<Tx, Rx>(
        channel_name: string | undefined,
        handler: (channel: MessageChannel<Rx, Tx>) => void
    ): () => void {
        const listener = (port: browser.Runtime.Port) => {
            if (!channel_name || port.name === channel_name) {
                const channel: MessageChannel<Rx, Tx> = {
                    name: port.name,
                    send: async (payload: Rx) => {
                        port.postMessage(payload);
                    },
                    listen: (handler) => {
                        const listener = (msg: any) => handler(msg as Tx);
                        port.onMessage.addListener(listener);
                        return () => port.onMessage.removeListener(listener);
                    },
                    on_disconnect: (handler) => {
                        port.onDisconnect.addListener(handler);
                        return () => port.onDisconnect.removeListener(handler);
                    },
                    disconnect: () => port.disconnect()
                };
                handler(channel);
            }
        };

        browser.runtime.onConnect.addListener(listener);
        return () => browser.runtime.onConnect.removeListener(listener);
    }
}
