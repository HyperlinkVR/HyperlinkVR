// where a host keeps its published files. implement this per backend (local disk, r2, a github repo, etc)
// paths are relative to the host's base url with no leading slash, e.g. "v1/posts/01J9.../post.json"
export interface SiteStore {
    get(path: string): Promise<Uint8Array | null>;
    put(path: string, body: Uint8Array | string, content_type: string): Promise<void>;
    delete(path: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
}

export const get_json = async (store: SiteStore, path: string): Promise<unknown> => {
    const body = await store.get(path);
    return body ? JSON.parse(new TextDecoder().decode(body)) : null;
};
