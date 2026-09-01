import type { StorageEngine, StorageKind } from "@hyperlinkvr/core";
import browser from "webextension-polyfill";





export class ExtensionStorage<T extends StorageKind> implements StorageEngine {
    readonly kind: T;

    constructor(kind: T) {
        this.kind = kind;
    }

    async get<V>(key: string): Promise<V | null> {
        // browser.storage natively throws on error, no need to manually check lastError!
        const result = await browser.storage[this.kind].get(key);

        // Note: browser.storage.get() returns an object like { [key]: value }
        return (result[key] as V) ?? null;
    }

    async set<V>(key: string, value: V): Promise<void> {
        await browser.storage[this.kind].set({ [key]: value });
        if (browser.runtime.lastError) {
            throw new Error(browser.runtime.lastError.message);
        }
    }

    async remove(key: string): Promise<void> {
        await browser.storage[this.kind].remove(key);
    }

    watch<V>(key: string, callback: (new_value: V | null) => void): () => void {
        const listener = (
            // You can use standard Record types here since the polyfill handles the shape
            changes: Record<string, { newValue?: any; oldValue?: any }>,
            areaName: string
        ) => {
            if (areaName === this.kind && changes[key]) {
                callback((changes[key].newValue as V) ?? null);
            }
        };

        browser.storage.onChanged.addListener(listener);

        // Return the cleanup function
        return () => {
            browser.storage.onChanged.removeListener(listener);
        };
    }

    async entries<V>(prefix?: string) {
        const all = await browser.storage[this.kind].get(null);
        const filtered: Record<string, V> = {};
        for (const [key, value] of Object.entries(all)) {
            if (!prefix || key.startsWith(prefix)) {
                filtered[key] = value as V;
            }
        }
        return filtered;
    }

    watch_all(callback: (changes: Partial<Record<string, { new_value?: any }>>) => void): () => void {
        const listener = (changes: Record<string, { newValue?: any; oldValue?: any }>, area: string) => {
            if (area === this.kind) {
                const filtered_changes: Partial<Record<string, { new_value?: any }>> = {};
                for (const [key, change] of Object.entries(changes)) {
                    filtered_changes[key] = { new_value: change.newValue };
                }
                callback(filtered_changes);
            }
        };
        browser.storage.onChanged.addListener(listener);
        return () => browser.storage.onChanged.removeListener(listener);
    }
}
