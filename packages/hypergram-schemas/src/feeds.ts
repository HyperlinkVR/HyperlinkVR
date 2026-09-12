import {z} from "zod";

export const RecentPostsSchema = z.object({
    updated: z.number(),
    posts: z.array(z.url()).max(20)
});
export type RecentPosts = z.infer<typeof RecentPostsSchema>;

export const PostPageSchema = z.object({
    oldest_ts: z.number(),
    next_page: z.url(),

    posts: z.array(z.url()).max(20)
});
export type PostPage = z.infer<typeof PostPageSchema>;
