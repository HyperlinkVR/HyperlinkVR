import type { StorageEngine, StorageKind } from "@hyperlinkvr/core";

type ChangeCallback = (new_value: any) => void;
type BatchChangeCallback = (
    changes: Partial<Record<string, { new_value?: any }>>
) => void;

export class BrowserStorageEngine<T extends StorageKind = StorageKind>
    implements StorageEngine<T>
{
    readonly kind: T;
    readonly #storage: Storage | null;
    readonly #key_prefix: string;
    #key_listeners = new Map<string, Set<ChangeCallback>>();
    #all_listeners = new Set<BatchChangeCallback>();

    constructor(kind: T) {
        this.kind = kind;

        if (kind === "session") {
            this.#storage =
                typeof window !== "undefined" ? window.sessionStorage : null;
            this.#key_prefix = "";
        } else if (kind === "sync") {
            this.#storage =
                typeof window !== "undefined" ? window.localStorage : null;
            this.#key_prefix = "__sync__:"; // namespaced for future sync migration
        } else {
            this.#storage =
                typeof window !== "undefined" ? window.localStorage : null;
            this.#key_prefix = "";
        }

        if (typeof window !== "undefined") {
            window.addEventListener("storage", this.#on_window_storage_event);
        }
    }

    #format_key = (key: string): string => {
        return `${this.#key_prefix}${key}`;
    };

    #strip_prefix = (prefixed_key: string): string | null => {
        if (!this.#key_prefix) return prefixed_key;
        if (prefixed_key.startsWith(this.#key_prefix)) {
            return prefixed_key.slice(this.#key_prefix.length);
        }
        return null;
    };

    #notify = (key: string, new_value: any) => {
        const key_set = this.#key_listeners.get(key);
        if (key_set) {
            key_set.forEach((cb) => cb(new_value));
        }

        const changes: Partial<Record<string, { new_value?: any }>> = {
            [key]: new_value !== null ? { new_value } : {}
        };
        this.#all_listeners.forEach((cb) => cb(changes));
    };

    #on_window_storage_event = (event: StorageEvent) => {
        if (event.storageArea !== this.#storage || !event.key) return;

        const raw_key = this.#strip_prefix(event.key);
        if (raw_key === null) return; // belongs to a different key namespace

        let parsed_val = null;
        if (event.newValue !== null) {
            try {
                parsed_val = JSON.parse(event.newValue);
            } catch {
                parsed_val = event.newValue;
            }
        }

        this.#notify(raw_key, parsed_val);
    };

    get = async <V>(key: string): Promise<V | null> => {
        if (!this.#storage) return null;

        const raw_val = this.#storage.getItem(this.#format_key(key));
        if (raw_val === null) return null;

        try {
            return JSON.parse(raw_val) as V;
        } catch {
            return raw_val as unknown as V;
        }
    };

    set = async <V>(key: string, value: V): Promise<void> => {
        if (!this.#storage) return;

        const serialized = JSON.stringify(value);
        this.#storage.setItem(this.#format_key(key), serialized);

        // trigger same-tab watchers
        this.#notify(key, value);
    };

    remove = async (key: string): Promise<void> => {
        if (!this.#storage) return;

        this.#storage.removeItem(this.#format_key(key));

        // trigger same-tab watchers
        this.#notify(key, null);
    };

    watch = <V>(
        key: string,
        callback: (new_value: V | null) => void
    ): (() => void) => {
        if (!this.#key_listeners.has(key)) {
            this.#key_listeners.set(key, new Set());
        }

        const set = this.#key_listeners.get(key)!;
        set.add(callback as ChangeCallback);

        return () => {
            set.delete(callback as ChangeCallback);
            if (set.size === 0) {
                this.#key_listeners.delete(key);
            }
        };
    };

    entries = async <V>(prefix: string = ""): Promise<Record<string, V>> => {
        const result: Record<string, V> = {};
        if (!this.#storage) return result;

        for (let i = 0; i < this.#storage.length; i++) {
            const full_key = this.#storage.key(i);
            if (!full_key) continue;

            const raw_key = this.#strip_prefix(full_key);
            if (raw_key === null) continue; // skip keys outside this engine's namespace

            if (prefix && !raw_key.startsWith(prefix)) continue;

            const raw_val = this.#storage.getItem(full_key);
            if (raw_val !== null) {
                try {
                    result[raw_key] = JSON.parse(raw_val) as V;
                } catch {
                    result[raw_key] = raw_val as unknown as V;
                }
            }
        }

        return result;
    };

    watch_all = (
        callback: (
            changes: Partial<Record<string, { new_value?: any }>>
        ) => void
    ): (() => void) => {
        this.#all_listeners.add(callback);
        return () => {
            this.#all_listeners.delete(callback);
        };
    };
}
