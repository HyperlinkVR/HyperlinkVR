import {z} from "zod";

export const PostPageSchema = z.object({
    oldest_ts: z.number(),
    posts: z.array(z.url()).max(20)
});
export type PostPage = z.infer<typeof PostPageSchema>;
