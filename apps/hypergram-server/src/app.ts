import { createFetchHandler } from "@ts-rest/serverless/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";

import {
    load_site_state,
    post_dir,
    post_path,
    publish_site,
    type SiteStore
} from "@hyperlinkvr/hypergram-host";
import { api_v1_write_contract, type HostManifest, type Post } from "@hyperlinkvr/hypergram-schemas/v1";

interface AppDeps {
    store: SiteStore;
    manifest: HostManifest;
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

export const create_app = ({ store, manifest }: AppDeps) => {
    const base_url = manifest.base_url.endsWith("/") ? manifest.base_url : `${manifest.base_url}/`;
    const abs = (store_path: string) => new URL(store_path, base_url).href;

    // a write loads the published files, mutates, and republishes the whole site (see hypergram-host).
    // TODO: no auth yet. a real host must verify the signature headers (see auth.ts build_signing_payload)
    // and check the author owns the post. the stub just trusts x-hypergram-author.
    const handle_write = createFetchHandler(api_v1_write_contract, {
        upload_post: async ({ body }, { request }) => {
            const author = request.headers.get("x-hypergram-author");
            if (!author) return { status: 401, body: { success: false, error: "missing x-hypergram-author header" } };

            const { metadata, image } = body;
            const image_store_path = `${post_dir(metadata.id)}/image.${ext_for(image)}`;
            await store.put(image_store_path, new Uint8Array(await image.arrayBuffer()), image.type || "application/octet-stream");

            const state = await load_site_state(store, manifest);
            const post: Post = {
                id: metadata.id,
                author,
                ts: Date.now(), // host clock, not the uploader's
                image_url: abs(image_store_path),
                thumb_url: abs(image_store_path), // stub: no separate thumbnail yet
                caption: metadata.caption
            };
            state.posts.push(post);
            await publish_site(store, state);

            return { status: 201, body: { success: true, status: "published" } };
        },

        edit_post: async ({ params, body }, { request }) => {
            const author = request.headers.get("x-hypergram-author");
            if (!author) return { status: 401, body: { success: false, error: "missing x-hypergram-author header" } };

            const state = await load_site_state(store, manifest);
            const post = state.posts.find((p) => p.id === params.id);
            if (!post) return { status: 404, body: { success: false, error: "post not found" } };

            post.caption = body.caption ?? undefined; // null removes the caption
            await publish_site(store, state);

            return { status: 200, body: { success: true, status: "published" } };
        },

        delete_post: async ({ params }, { request }) => {
            const author = request.headers.get("x-hypergram-author");
            if (!author) return { status: 401, body: { success: false, error: "missing x-hypergram-author header" } };

            const state = await load_site_state(store, manifest);
            const remaining = state.posts.filter((p) => p.id !== params.id);
            if (remaining.length === state.posts.length) return { status: 404, body: { success: false, error: "post not found" } };

            for (const path of await store.list(`${post_dir(params.id)}/`)) {
                if (!path.endsWith(".json")) await store.delete(path); // publish_site only prunes json, so drop the image here
            }
            await publish_site(store, { ...state, posts: remaining });

            return { status: 200, body: { success: true, status: "published" } };
        },

        // TODO: not implemented in the stub yet
        change_profile_picture: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } }),
        remove_profile_picture: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } }),
        delete_me: async () => ({ status: 500, body: { success: false, error: "not implemented yet" } })
    });

    const app = new Hono();

    app.use("*", cors()); // dev convenience: the client and frontend call from other origins

    // writes go through the ts-rest contract
    app.on(["POST", "PUT", "DELETE"], "/*", (c) => handle_write(c.req.raw));

    // reads are plain static files generated by the host, served straight from the store
    app.get("/*", async (c) => {
        const path = c.req.path.replace(/^\//, "");
        const body = await store.get(path);
        if (!body) return c.notFound();
        return c.body(body, 200, { "content-type": content_type_for(path) });
    });

    return app;
};
