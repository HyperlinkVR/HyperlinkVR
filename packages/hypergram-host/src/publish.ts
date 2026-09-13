import { PostSchema, ProfilePictureSchema } from "@hyperlinkvr/hypergram-schemas/v1";

import { generate_site, type SiteState } from "./generate";
import { get_json, type SiteStore } from "./store";

// the published post and picture files are the source of truth, so a host needs no database
// TODO: fine for small hosts, but reads every post on every write. an index file or a real db can replace this without touching generate_site
export const load_site_state = async (store: SiteStore): Promise<SiteState> => {
    const post_paths = (await store.list("v1/posts/")).filter((path) => path.endsWith("/post.json"));
    const picture_paths = (await store.list("v1/users/")).filter((path) => path.endsWith("/picture.json"));

    const posts = await Promise.all(post_paths.map(async (path) => PostSchema.parse(await get_json(store, path))));
    const pictures = await Promise.all(picture_paths.map(async (path) => ProfilePictureSchema.parse(await get_json(store, path))));

    return { posts, pictures };
};

// writes every generated json file and deletes json files that are no longer generated (e.g. a deleted post, a page lost to compaction)
// non-json files (images) are left alone, the caller manages those
export const publish_site = async (base_url: string, store: SiteStore, state: SiteState) => {
    const files = generate_site(base_url, state);
    const existing = (await store.list("v1/")).filter((path) => path.endsWith(".json"));

    for (const [path, body] of files) {
        await store.put(path, JSON.stringify(body), "application/json");
    }

    for (const path of existing) {
        if (!files.has(path)) {
            await store.delete(path);
        }
    }
};
