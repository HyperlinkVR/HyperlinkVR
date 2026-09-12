import {z} from "zod";

export const ProfilePictureSchema = z.object({
    author: z.string(), // should be the user part of the username, i.e. foo@bar.com would have author "foo"
    high_res_url: z.url(),
    low_res_url: z.url()
});
export type ProfilePicture = z.infer<typeof ProfilePictureSchema>;
export type ProfilePictureInput = z.input<typeof ProfilePictureSchema>;
