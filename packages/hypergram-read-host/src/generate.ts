import { insertParamsIntoPath } from "@ts-rest/core";
import {
    api_v1_read_contract,
    is_older_than,
    POSTS_PER_PAGE,
    type HostManifest,
    type Post,
    type PostPage,
    type ProfilePicture
} from "@hyperlinkvr/hypergram-schemas/v1";

// contract paths start with a slash, store paths don't
const store_path = (path: string) => path.replace(/^\//, "");

export const post_path = (id: string) => store_path(insertParamsIntoPath({ path: api_v1_read_contract.get_post.path, params: { id } }));
export const post_dir = (id: string) => post_path(id).replace(/\/[^/]+$/, "");

const manifest_path = store_path(api_v1_read_contract.get_manifest.path);
const recent_feed_path = store_path(api_v1_read_contract.get_recent_feed.path);
const user_feed_path = (identity: string) => store_path(insertParamsIntoPath({ path: api_v1_read_contract.get_user_feed.path, params: { identity } }));
const profile_picture_path = (identity: string) => store_path(insertParamsIntoPath({ path: api_v1_read_contract.get_profile_picture.path, params: { identity } }));

const sort_newest_first = (posts: Post[]) =>
    [...posts].sort((a, b) => (is_older_than(a, b) ? 1 : is_older_than(b, a) ? -1 : 0));

// head at <feed>.json, numbered pages at <feed>/<n>.json with 0 the oldest
// this is a full rebuild, so deletions compact pages, which only ever moves posts to lower numbered pages
const generate_feed = (base_url: string, head_path: string, posts: Post[]) => {
    const pages_dir = head_path.replace(/\.json$/, "");
    const page_path = (n: number) => `${pages_dir}/${n}.json`;
    const page_url = (n: number) => (n >= 0 ? new URL(page_path(n), base_url).href : null);

    const oldest_first = sort_newest_first(posts).reverse();
    const full_pages = Math.floor(oldest_first.length / POSTS_PER_PAGE);

    const files = new Map<string, PostPage>();

    for (let n = 0; n < full_pages; n++) {
        files.set(page_path(n), {
            posts: oldest_first.slice(n * POSTS_PER_PAGE, (n + 1) * POSTS_PER_PAGE).reverse(),
            next: page_url(n - 1)
        });
    }

    files.set(head_path, {
        posts: oldest_first.slice(full_pages * POSTS_PER_PAGE).reverse(),
        next: page_url(full_pages - 1)
    });

    return files;
};

export interface SiteState {
    posts: Post[];
    pictures: ProfilePicture[];
}


export const generate_site = (base_url: string, { posts, pictures }: SiteState, manifest: HostManifest) => {
    const files = new Map<string, unknown>();

    files.set(manifest_path, manifest);

    for (const [path, page] of generate_feed(base_url, recent_feed_path, posts)) {
        files.set(path, page);
    }

    const by_author = Map.groupBy(posts, (post) => post.author);
    for (const [author, author_posts] of by_author) {
        for (const [path, page] of generate_feed(base_url, user_feed_path(author), author_posts)) {
            files.set(path, page);
        }
    }

    for (const post of posts) {
        files.set(post_path(post.id), post);
    }

    for (const picture of pictures) {
        files.set(profile_picture_path(picture.author), picture);
    }

    return files;
};
