import type { SiteStore } from "@hyperlinkvr/hypergram-host";

// dev-only store: everything lives in memory and is lost on restart (node.ts reseeds on boot).
// a real host swaps this for local disk, r2, a github repo, etc. nothing else in the server changes.
export class MemorySiteStore implements SiteStore {
    private readonly files = new Map<string, Uint8Array>();

    async get(path: string): Promise<Uint8Array | null> {
        return this.files.get(path) ?? null;
    }

    async put(path: string, body: Uint8Array | string, _content_type: string): Promise<void> {
        this.files.set(path, typeof body === "string" ? new TextEncoder().encode(body) : body);
    }

    async delete(path: string): Promise<void> {
        this.files.delete(path);
    }

    async list(prefix: string): Promise<string[]> {
        return [...this.files.keys()].filter((path) => path.startsWith(prefix));
    }
}
