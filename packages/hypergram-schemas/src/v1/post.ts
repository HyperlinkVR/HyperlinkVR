import {z} from "zod";

import { CaptionSchema, IdentitySchema, PostIDSchema, URLSchema } from "./common";

export const PostSchema = z.object({
    id: PostIDSchema,
    author: IdentitySchema,
    ts: z.number().int(), // ms since epoch, set by the host when it publishes (not the uploader's clock) as feeds are ordered by it
    image_url: URLSchema,
    thumb_url: URLSchema,
    caption: CaptionSchema.optional()
});
export type Post = z.infer<typeof PostSchema>;
export type PostInput = z.input<typeof PostSchema>;
