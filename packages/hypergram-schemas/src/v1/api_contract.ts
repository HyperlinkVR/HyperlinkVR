import { initContract } from "@ts-rest/core";
import { z } from "zod";



import { EditRequestSchema, FailedActionResponseSchema, SuccessfulActionResponseSchema, UploadRequestMetadataSchema } from "./actions";
import { PostPageSchema } from "./feeds";
import { PostSchema } from "./post";


const c = initContract();

export const FileSchema = z.custom<File | Blob>((val) => typeof val !== "string", "Expected a file");

export const api_v1_contract = c.router(
    {
        get_post: {
            method: "GET",
            path: "/v1/posts/:id",

            responses: {
                200: PostSchema
            },

            summary: "Get an uploaded post"
        },

        get_profile_picture: {
            method: "GET",
            path: "/v1/users/:user/picture",

            responses: {
                200: FileSchema
            },

            summary:
                'Get the profile picture for a given user (e.g. for foo@bar.com, specify "foo") or for yourself by specifying "me"'
        },

        get_recent_posts: {
            method: "GET",
            path: "/v1/feeds/recent",

            query: z.object({
                timestamp: z.number()
            }),

            responses: {
                200: PostPageSchema
            },

            summary:
                "Get a feed of recent posts from this instance, paginated by timestamp"
            // TODO: how will this work with gh pages? is timestamp the wrong key here
        },

        get_user_posts: {
            method: "GET",
            path: "/v1/feeds/user/:user",

            query: z.object({
                timestamp: z.number()
            }),

            responses: {
                200: PostPageSchema
            },

            summary:
                'Get a feed of recent posts from a given user (e.g. for foo@bar.com, specify "foo") or for yourself by specifying "me", paginated by timestamp. '
            // TODO: how will this work with gh pages? is timestamp the wrong key here
        },

        upload_post: {
            method: "POST",
            path: "/v1/posts",
            contentType: "multipart/form-data",

            // TODO: auth handling

            body: z.object({
                image: FileSchema,
                metadata: UploadRequestMetadataSchema
            }),

            responses: {
                201: SuccessfulActionResponseSchema
            },

            summary: "Create a new post"
        },

        edit_post: {
            method: "PUT",
            path: "/v1/posts/:id",
            contentType: "application/json",

            // TODO: auth handling

            body: EditRequestSchema,

            responses: {
                204: SuccessfulActionResponseSchema
            },

            summary: "Edit an existing post of yours"
        },

        delete_post: {
            method: "DELETE",
            path: "/v1/posts/:id",

            // TODO: auth handling

            responses: {
                204: SuccessfulActionResponseSchema
            },

            summary: "Delete a post of yours"
        },

        change_profile_picture: {
            method: "PUT",
            path: "/v1/users/me/picture",
            contentType: "multipart/form-data",

            // TODO: auth handling

            body: z.object({
                image: FileSchema
            }),

            responses: {
                204: SuccessfulActionResponseSchema
            },

            summary: "Set or change your profile picture"
        },

        remove_profile_picture: {
            method: "DELETE",
            path: "/v1/users/me/picture",

            // TODO: auth handling

            responses: {
                204: SuccessfulActionResponseSchema
            },

            summary: "Remove your profile picture"
        }
    },
    {
        commonResponses: {
            200: SuccessfulActionResponseSchema,
            400: FailedActionResponseSchema,
            401: FailedActionResponseSchema,
            404: FailedActionResponseSchema,
            500: FailedActionResponseSchema
        }
    }
);
