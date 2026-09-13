import { initContract } from "@ts-rest/core";
import { z } from "zod";



import { EditRequestSchema, FailedActionResponseSchema, SuccessfulActionResponseSchema, UploadRequestMetadataSchema } from "./actions";
import { IdentitySchema, PostIDSchema } from "./common";
import { PostPageSchema } from "./feeds";
import { PostSchema } from "./post";
import { ProfilePictureSchema } from "./profile_picture";


const c = initContract();

export const FileSchema = z.custom<File | Blob>((val) => typeof val !== "string", "Expected a file");

// reads must be servable as plain static files (e.g. github pages), so:
//  - every path is a fixed file with an extension (params sit in a directory, as ts-rest would treat ":id.json" as a param named "id.json")
//  - no query strings, anything beyond the feed heads is reached by following PostPage.next
//  - no auth and no "me", reads are always public
// a 404 from a static host won't have a json body, so reads only declare 200

export const api_v1_read_contract = c.router({
    get_recent_feed: {
        method: "GET",
        path: "/v1/feeds/recent.json",

        responses: {
            200: PostPageSchema
        },

        summary: "Get the head of the feed of recent posts on this host, follow next for older pages"
    },

    get_user_feed: {
        method: "GET",
        path: "/v1/users/:identity/feed.json",
        pathParams: z.object({
            identity: IdentitySchema
        }),

        responses: {
            200: PostPageSchema
        },

        summary: 'Get the head of the feed of posts on this host by a given identity (e.g. "foo@bar.com"), follow next for older pages'
    },

    get_post: {
        method: "GET",
        path: "/v1/posts/:id/post.json",
        pathParams: z.object({
            id: PostIDSchema
        }),

        responses: {
            200: PostSchema
        },

        summary: "Get an uploaded post"
    },

    get_profile_picture: {
        method: "GET",
        path: "/v1/users/:identity/picture.json",
        pathParams: z.object({
            identity: IdentitySchema
        }),

        responses: {
            200: ProfilePictureSchema
        },

        summary: 'Get the profile picture for a given identity (e.g. "foo@bar.com"), 404 if they have none'
    }
});

export const api_v1_write_contract = c.router(
    {
        upload_post: {
            method: "POST",
            path: "/v1/posts",
            contentType: "multipart/form-data",

            // signed body parts: metadata, image
            body: z.object({
                metadata: UploadRequestMetadataSchema,
                image: FileSchema
            }),

            responses: {
                201: SuccessfulActionResponseSchema
            },

            summary: "Create a new post"
        },

        edit_post: {
            method: "PUT",
            path: "/v1/posts/:id",
            pathParams: z.object({
                id: PostIDSchema
            }),
            contentType: "application/json",

            // signed body parts: the json body
            body: EditRequestSchema,

            responses: {
                200: SuccessfulActionResponseSchema
            },

            summary: "Edit an existing post of yours"
        },

        delete_post: {
            method: "DELETE",
            path: "/v1/posts/:id",
            pathParams: z.object({
                id: PostIDSchema
            }),

            responses: {
                200: SuccessfulActionResponseSchema
            },

            summary: "Delete a post of yours"
        },

        change_profile_picture: {
            method: "PUT",
            path: "/v1/users/me/picture",
            contentType: "multipart/form-data",

            // signed body parts: image
            body: z.object({
                image: FileSchema
            }),

            responses: {
                200: SuccessfulActionResponseSchema
            },

            summary: "Set or change your profile picture"
        },

        remove_profile_picture: {
            method: "DELETE",
            path: "/v1/users/me/picture",

            responses: {
                200: SuccessfulActionResponseSchema
            },

            summary: "Remove your profile picture"
        },

        delete_me: {
            method: "DELETE",
            path: "/v1/users/me",

            responses: {
                200: SuccessfulActionResponseSchema
            },

            summary: "Erase everything you have on this host (posts, profile picture, your user feed)"
        }
    },
    {
        commonResponses: {
            400: FailedActionResponseSchema,
            401: FailedActionResponseSchema, // missing or invalid auth
            403: FailedActionResponseSchema, // authenticated, but not allowed (e.g. identity host not accepted, not the post's author)
            404: FailedActionResponseSchema,
            413: FailedActionResponseSchema,
            429: FailedActionResponseSchema,
            500: FailedActionResponseSchema
        },
        baseHeaders: {
            "Authorization": z.string()
        }
    }
);

export const api_v1_auth_contract = c.router({
    login_game: {
        method: "POST",
        path: "/v1/auth/game",

        headers: z.object({
            "X-Hypergram-Identity": z.string(),
            "X-Hypergram-Signature": z.string(),
            "X-Hypergram-SignatureTimestamp": z.string()
        }),

        body: c.noBody(),

        responses: {
            200: z.object({
                token: z.string()
            }),
            401: FailedActionResponseSchema
        },

        summary: "Headless login for the game engine. Validates the game engine headers and returns a Bearer token instantly."
    },

    login_web: {
        method: "POST",
        path: "/v1/auth/web",

        body: z.object({
            redirect_uri: z.url()
        }),

        responses: {
            200: z.object({
                auth_url: z.url()
            })
        },

        summary: "Initialise browser-based login. Returns the URL the UI must navigate the user to. Upon completion, the host redirects back to the provided redirect_uri with the URL hash '#token=TOKENHERE&username=user@host.com'."
    },

    logout: {
        method: "DELETE",
        path: "/v1/auth/logout",

        body: c.noBody(),

        responses: {
            200: SuccessfulActionResponseSchema
        },

        summary: "Invalidate the current authorisation token on the server."
    }
});
