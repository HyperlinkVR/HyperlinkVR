export type StorageKind = "local" | "sync" | "session";

export interface StorageEngine<T extends StorageKind = StorageKind> {
    readonly kind: T;

    get<V>(key: string): Promise<V | null>;
    set<V>(key: string, value: V): Promise<void>;
    remove(key: string): Promise<void>;

    watch<V>(key: string, callback: (new_value: V | null) => void): () => void;

    entries<V>(prefix?: string): Promise<Record<string, V>>;
    watch_all(callback: (changes: Partial<Record<string, { new_value?: any }>>) => void): () => void;
}
