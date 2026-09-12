import {z} from "zod";

import { URLSchema } from "./common";
import { PostSchema, type Post } from "./post";

export const POSTS_PER_PAGE = 20;

export const PostPageSchema = z.object({
    posts: z.array(PostSchema).max(POSTS_PER_PAGE), // newest first
    next: URLSchema.nullable() // the next older page, null once there are no older posts
});
export type PostPage = z.infer<typeof PostPageSchema>;
export type PostPageInput = z.input<typeof PostPageSchema>;

// a reader's position in a feed: the oldest post it has shown so far
export type FeedCursor = Pick<Post, "ts" | "id">;

export const is_older_than = (post: FeedCursor, cursor: FeedCursor) =>
    post.ts < cursor.ts || (post.ts === cursor.ts && post.id < cursor.id);
