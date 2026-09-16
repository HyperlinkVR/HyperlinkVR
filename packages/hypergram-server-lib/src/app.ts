import { generate_read, get_json, is_generated_read, load_site_state, manifest_path, post_dir, post_path, type SiteStore } from "@hyperlinkvr/hypergram-read-host";
import { api_v1_auth_contract, api_v1_write_contract, PostSchema, type HostManifest, type Post } from "@hyperlinkvr/hypergram-schemas/v1";
import { createFetchHandler } from "@ts-rest/serverless/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ulid } from "ulidx";

import type { AuthAdapter } from "./auth";

export interface AppDeps {
    store: SiteStore;
    base_url: string;
    auth: AuthAdapter;
    // shown in the manifest so clients can label the host
    name?: string;
    // also serve the static read files straight from the store
    // leave on for an all-in-one / dev host, turn off when reads are served by a cdn or static host (e.g. github pages) and this server only handles writes + auth.
    serve_reads?: boolean;
}

const content_type_for = (path: string): string => {
    if (path.endsWith(".json")) return "application/json";
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".webp")) return "image/webp";
    return "application/octet-stream";
};

const ext_for = (file: File | Blob): string => {
    switch (file.type) {
        case "image/png":
            return "png";
        case "image/jpeg":
            return "jpg";
        case "image/webp":
            return "webp";
        default:
            return "bin";
    }
};

const parse_multipart = async (request: Request): Promise<void> => {
    if (!request.headers.get("content-type")?.includes("multipart/form-data")) return;

    const content: Record<string, unknown> = {};
    for (const [key, value] of (await request.formData()).entries()) {
        if (typeof value !== "string") {
            content[key] = value; // File / Blob
        } else {
            try {
                content[key] = JSON.parse(value);
            } catch {
                content[key] = value;
            }
        }
    }
    (request as unknown as { content: unknown }).content = content;
};

// hono may already have consumed the raw body, so rebuild a fresh Request for the ts-rest fetch handler.
const to_fetch_request = async (c: any): Promise<Request> => {
    const method = c.req.method;
    const headers = new Headers();
    for (const [key, value] of Object.entries(c.req.header())) {
        headers.set(key, value as string);
    }

    let body: ArrayBuffer | undefined;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        const buf = await c.req.raw.arrayBuffer();
        if (buf.byteLength > 0) body = buf;
    }

    return new Request(c.req.url, { method, headers, body });
};

export const create_app = async ({ store, base_url, auth, name, serve_reads = true }: AppDeps) => {
    const abs = (store_path: string) => new URL(store_path, base_url).href;

    const manifest: HostManifest = {
        name,
        bases: {
            write: base_url,
            auth: base_url
        },
        auth: { login: true, web: typeof auth.login_web === "function" }
    };

    // a write only touches its own source-of-truth files (post.json + image); the manifest and feeds are
    // generated on demand at read time (see the read handlers below), never materialised to the store.
    const handle_write = createFetchHandler(api_v1_write_contract, {
        upload_post: async ({ body }, { request }) => {
            const identity = await auth.authenticate(request);
            if (!identity) return { status: 401, body: { success: false, error: "unauthenticated" } };

            const { metadata, image } = body;
            const id = ulid(); // host assigns the id, so its clock also orders the ulid consistently with post.ts
            const image_store_path = `${post_dir(id)}/image.${ext_for(image)}`;
            await store.put(image_store_path, new Uint8Array(await image.arrayBuffer()), image.type || "application/octet-stream");

            const post: Post = {
                id,
                author: identity,
                ts: Date.now(), // host clock, not the uploader's
                image_url: abs(image_store_path),
                thumb_url: abs(image_store_path), // stub: no separate thumbnail yet
                caption: metadata.caption
            };
            await store.put(post_path(id), JSON.stringify(post), "application/json");

            return { status: 201, body: { success: true, status: "published", post_url: abs(post_path(id)) } };
        },

        edit_post: async ({ params, body }, { request }) => {
            const identity = await auth.authenticate(request);
            if (!identity) return { status: 401, body: { success: false, error: "unauthenticated" } };

            const existing = await get_json(store, post_path(params.id));
            if (!existing) return { status: 404, body: { success: false, error: "post not found" } };
            const post = PostSchema.parse(existing);
            if (post.author !== identity) return { status: 403, body: { success: false, error: "not your post" } };

            post.caption = body.caption ?? undefined; // null removes the caption
            await store.put(post_path(post.id), JSON.stringify(post), "application/json");

            return { status: 200, body: { success: true, status: "published", post_url: abs(post_path(post.id)) } };
        },

        delete_post: async ({ params }, { request }) => {
            const identity = await auth.authenticate(request);
            if (!identity) return { status: 401, body: { success: false, error: "unauthenticated" } };

            const existing = await get_json(store, post_path(params.id));
            if (!existing) return { status: 404, body: { success: false, error: "post not found" } };
            const target = PostSchema.parse(existing);
            if (target.author !== identity) return { status: 403, body: { success: false, error: "not your post" } };

            // drop the whole post directory (post.json + image); the feeds stop referencing it once it's gone
            for (const path of await store.list(`${post_dir(params.id)}/`)) {
                await store.delete(path);
            }

            return { status: 200, body: { success: true, status: "published" } };
        },

        // TODO: not implemented yet
        change_profile_picture: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } }),
        remove_profile_picture: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } }),
        delete_me: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } })
    }, {
        requestMiddleware: [parse_multipart]
    });

    const handle_auth = createFetchHandler(api_v1_auth_contract, {
        login_game: async (_args, { request }) => {
            const token = await auth.login_game(request);
            if (!token) return { status: 401, body: { success: false, error: "invalid signature" } };
            return { status: 200, body: { token } };
        },

        login_web: async ({ body }) =>
            auth.login_web
                ? { status: 200, body: { auth_url: await auth.login_web(body.redirect_uri) } }
                : { status: 200, body: { auth_url: new URL("/v1/auth/web/not-supported", body.redirect_uri).href } },

        // delegated to the adapter; a no-op when it doesn't track revocable sessions (e.g. stateless tokens).
        logout: async (_args, { request }) => {
            await auth.logout?.(request);
            return { status: 200, body: { success: true, status: "published" } };
        }
    });

    const app = new Hono();

    app.use("*", cors()); // the client and frontend call from other origins

    app.on(["POST", "PUT", "DELETE"], "/*", async (c) => {
        const fetch_request = await to_fetch_request(c);
        return c.req.path.startsWith("/v1/auth/") ? handle_auth(fetch_request) : handle_write(fetch_request);
    });

    if (serve_reads) {
        app.get("/*", async (c) => {
            const path = c.req.path.replace(/^\//, "");

            // manifest is pure config, no store I/O
            if (path === manifest_path) return c.json(manifest);

            // feeds are generated on demand from the stored posts, never materialised to the store
            if (is_generated_read(path)) {
                const body = generate_read(base_url, path, await load_site_state(store), manifest);
                return body === null ? c.notFound() : c.json(body);
            }

            // everything else (post.json, picture.json, images) is a stored file served as-is
            const body = await store.get(path);
            if (!body) return c.notFound();
            // copy into a fresh Uint8Array so the backing buffer is a plain ArrayBuffer (what hono's body type wants)
            return c.body(new Uint8Array(body), 200, { "content-type": content_type_for(path) });
        });
    }

    return app;
};
