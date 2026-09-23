import { z } from "zod";

import { CaptionSchema, URLSchema } from "./common";

// all requests enacted restfully on the post entity, authenticated with one of the host's write auth methods (see auth.ts)

export const SuccessfulActionResponseSchema = z.object({
    success: z.literal(true),
    // pending when the host publishes asynchronously (e.g. a github action rebuilding pages), so the result may take a few minutes to appear
    status: z.enum(["published", "pending"]),
    post_url: URLSchema.optional() // for upload/edit: the canonical url of the affected post (the host assigns the id)
});

export const FailedActionResponseSchema = z.object({
    success: z.literal(false),
    error: z.string(),
    retry_ms: z.number().positive().optional()
});

export const ActionResponseSchema = z.discriminatedUnion("success", [
    SuccessfulActionResponseSchema,
    FailedActionResponseSchema
]);
export type ActionResponse = z.infer<typeof ActionResponseSchema>;
export type ActionResponseInput = z.input<typeof ActionResponseSchema>;


// upload request will just be a standard file POST with whichever auth headers, alongside this metadata.
// the host assigns the post id (a ulid) and returns its url in the response.
export const UploadRequestMetadataSchema = z.object({
    caption: CaptionSchema.optional()
});
export type UploadRequestMetadata = z.infer<typeof UploadRequestMetadataSchema>;
export type UploadRequestMetadataInput = z.input<typeof UploadRequestMetadataSchema>;

// profile picture upload just a standard file PUT without metadata to a special route
// it can be DELETEd but not edited (as it'll already upsert with PUT and has no caption etc)


// edit will be a restful PUT enacted on the post entity
export const EditRequestSchema = z.object({
    caption: CaptionSchema.nullable() // null removes the caption
});
export type EditRequest = z.infer<typeof EditRequestSchema>;
export type EditRequestInput = z.input<typeof EditRequestSchema>;

// deletion request will be restful DELETE enacted on the post/pfp entity with no metadata
