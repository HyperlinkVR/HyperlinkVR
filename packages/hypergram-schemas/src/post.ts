import {z} from "zod";

export const PostSchema = z.object({
    author: z.string(), // should be the user part of the username, i.e. foo@bar.com would have author "foo"
    ts: z.number(),
    image_url: z.url(),
    thumb_url: z.url(),
    post_url: z.url(),
    caption: z.string().min(1).max(512).optional()
});
export type Post = z.infer<typeof PostSchema>;
export type PostInput = z.input<typeof PostSchema>;

export const MyPostSchema = PostSchema.extend({
    deletion_url: z.url(),
    edit_url: z.url().optional()
});

export type MyPost = z.infer<typeof MyPostSchema>;
export type MyPostInput = z.input<typeof MyPostSchema>;
