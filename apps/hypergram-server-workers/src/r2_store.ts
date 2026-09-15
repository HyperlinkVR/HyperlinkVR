import type { SiteStore } from "@hyperlinkvr/hypergram-read-host";

export class R2SiteStore implements SiteStore {
    constructor(
        private readonly bucket: R2Bucket,
        private readonly root: string = "",
        private readonly ctx?: ExecutionContext,
        private readonly ip_limiter?: RateLimit,
        private readonly global_limiter?: RateLimit,
        private readonly ttl_seconds: number = 86400 // Default 1 day cache
    ) {}

    private full(path: string): string {
        if (!this.root) return path;
        return `${this.root.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    }

    private relative(key: string): string {
        if (!this.root) return key;
        const prefix = `${this.root.replace(/\/$/, "")}/`;
        return key.startsWith(prefix) ? key.slice(prefix.length) : key;
    }

    private async check_limits(
        action: string,
        client_key?: string
    ): Promise<void> {
        if (this.ip_limiter && client_key) {
            const { success } = await this.ip_limiter.limit({
                key: `${client_key}:${action}`
            });
            if (!success) {
                throw new Error(`IP_RATE_LIMIT_EXCEEDED:${action}`);
            }
        }

        if (this.global_limiter) {
            const { success } = await this.global_limiter.limit({
                key: action
            });
            if (!success) {
                throw new Error(`GLOBAL_RATE_LIMIT_EXCEEDED:${action}`);
            }
        }
    }

    async get(path: string, client_key?: string): Promise<Uint8Array | null> {
        await this.check_limits("get", client_key);

        const fullPath = this.full(path);

        const cache_url = new URL(`https://r2-cache.internal/${fullPath}`);
        const cache_key = new Request(cache_url.toString());
        const cache = caches.default;

        // check cache first before invoking a read operation
        const cached = await cache.match(cache_key);
        if (cached) {
            const buffer = await cached.arrayBuffer();
            return new Uint8Array(buffer);
        }

        // cache miss
        const object = await this.bucket.get(fullPath);
        if (!object) return null;

        const buffer = await object.arrayBuffer();

        const response_to_cache = new Response(buffer, {
            headers: {
                "Cache-Control": `public, s-maxage=${this.ttl_seconds}`
            }
        });

        // write to cache in background without delaying the response
        if (this.ctx) {
            this.ctx.waitUntil(cache.put(cache_key, response_to_cache));
        } else {
            await cache.put(cache_key, response_to_cache);
        }

        return new Uint8Array(buffer);
    }

    async put(
        path: string,
        body: Uint8Array | string,
        client_key?: string
    ): Promise<void> {
        await this.check_limits("put", client_key);

        const full_path = this.full(path);
        await this.bucket.put(full_path, body);

        // invalidate cache
        const cache_url = new URL(`https://r2-cache.internal/${full_path}`);
        await caches.default.delete(new Request(cache_url.toString()));
    }

    async delete(path: string, client_key?: string): Promise<void> {
        await this.check_limits("delete", client_key);

        const full_path = this.full(path);
        await this.bucket.delete(full_path);

        // invalidate cache
        const cache_url = new URL(`https://r2-cache.internal/${full_path}`);
        await caches.default.delete(new Request(cache_url.toString()));
    }

    async list(prefix: string, client_key?: string): Promise<string[]> {
        await this.check_limits("list", client_key);

        const out: string[] = [];
        let cursor: string | undefined = undefined;
        const full_prefix = this.full(prefix);

        do {
            const result: R2Objects = await this.bucket.list({
                prefix: full_prefix,
                cursor: cursor
            });

            for (const object of result.objects) {
                out.push(this.relative(object.key));
            }

            cursor = result.truncated ? result.cursor : undefined;
        } while (cursor);

        return out;
    }
}

