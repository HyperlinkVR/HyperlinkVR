import {z} from "zod";

import { IdentitySchema, URLSchema } from "./common";

export const ProfilePictureSchema = z.object({
    author: IdentitySchema,
    high_res_url: URLSchema,
    low_res_url: URLSchema
});
export type ProfilePicture = z.infer<typeof ProfilePictureSchema>;
export type ProfilePictureInput = z.input<typeof ProfilePictureSchema>;
