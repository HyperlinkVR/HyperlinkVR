import { load_site_state, post_dir, post_path, publish_site, type SiteStore } from "@hyperlinkvr/hypergram-host";
import { api_v1_auth_contract, api_v1_write_contract, type Post } from "@hyperlinkvr/hypergram-schemas/v1";
import { createFetchHandler } from "@ts-rest/serverless/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";



import { DEV_BASE_URL } from "./seed";


interface AppDeps {
    store: SiteStore;
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

const to_fetch_request = async (c: any): Promise<Request> => {
    const url = c.req.url;
    const method = c.req.method;
    const headers = new Headers();

    for (const [key, value] of Object.entries(c.req.header())) {
        headers.set(key, value);
    }

    let body: ArrayBuffer | undefined = undefined;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        try {
            const buf = await c.req.raw.arrayBuffer();
            if (buf && buf.byteLength > 0) body = buf;
        } catch {
            // already consumed
        }
    }

    return new Request(url, {
        method,
        headers,
        body
    });
};

export const create_app = ({ store }: AppDeps) => {
    const abs = (store_path: string) => new URL(store_path, DEV_BASE_URL).href;

    const handle_write = createFetchHandler(api_v1_write_contract, {
        upload_post: async ({ body }, { request }) => {
            const { metadata, image } = body;
            const image_store_path = `${post_dir(metadata.id)}/image.${ext_for(image)}`;
            await store.put(image_store_path, new Uint8Array(await image.arrayBuffer()), image.type || "application/octet-stream");

            const state = await load_site_state(store);
            const post: Post = {
                id: metadata.id,
                author: "SETME@example.com", // stub: no auth yet
                ts: Date.now(), // host clock, not the uploader's
                image_url: abs(image_store_path),
                thumb_url: abs(image_store_path), // stub: no separate thumbnail yet
                caption: metadata.caption
            };
            state.posts.push(post);
            await publish_site(DEV_BASE_URL, store, state);

            return { status: 201, body: { success: true, status: "published" } };
        },

        edit_post: async ({ params, body }, { request }) => {
            const state = await load_site_state(store);
            const post = state.posts.find((p) => p.id === params.id);
            if (!post) return { status: 404, body: { success: false, error: "post not found" } };

            post.caption = body.caption ?? undefined; // null removes the caption
            await publish_site(DEV_BASE_URL, store, state);

            return { status: 200, body: { success: true, status: "published" } };
        },

        delete_post: async ({ params }, { request }) => {
            const state = await load_site_state(store);
            const remaining = state.posts.filter((p) => p.id !== params.id);
            if (remaining.length === state.posts.length) return { status: 404, body: { success: false, error: "post not found" } };

            for (const path of await store.list(`${post_dir(params.id)}/`)) {
                if (!path.endsWith(".json")) await store.delete(path); // publish_site only prunes json, so drop the image here
            }
            await publish_site(DEV_BASE_URL, store, { ...state, posts: remaining });

            return { status: 200, body: { success: true, status: "published" } };
        },

        // TODO: not implemented in the stub yet
        change_profile_picture: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } }),
        remove_profile_picture: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } }),
        delete_me: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } })
    });

    const handle_auth = createFetchHandler(api_v1_auth_contract, {
        login_web: async (req) => ({ status: 200, body: { auth_url: `https://example.com?redirect=${req.body.redirect_uri}` } }),
        login_game: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } }),
        logout: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } })
    });

    const app = new Hono();

    app.use("*", cors()); // dev convenience: the client and frontend call from other origins

    // writes and auth go through the ts-rest contract
    app.on(["POST", "PUT", "DELETE"], "/*", async (c) => {
        const path = c.req.path;
        const fetch_request = await to_fetch_request(c);
        if (path.startsWith("/v1/auth/")) {
            return handle_auth(fetch_request);
        } else {
            return handle_write(fetch_request);
        }
    });

    // reads are plain static files generated by the host, served straight from the store
    app.get("/*", async (c) => {
        const path = c.req.path.replace(/^\//, "");
        const body = await store.get(path);
        if (!body) return c.notFound();
        return c.body(body, 200, { "content-type": content_type_for(path) });
    });

    return app;
};
