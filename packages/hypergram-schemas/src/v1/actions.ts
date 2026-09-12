import { z } from "zod";

// all requests enacted restfully on the post entity

export const SuccessfulActionResponseSchema = z.object({
    success: z.literal(true),
    post_url: z.url()
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


// upload request will just be a standard file POST with whichever auth headers, alongside this metadata
export const UploadRequestMetadataSchema = z.object({
    caption: z.string().min(1).max(512).optional()
});
export type UploadRequestMetadata = z.infer<typeof UploadRequestMetadataSchema>;
export type UploadRequestMetadataInput = z.input<typeof UploadRequestMetadataSchema>;

// profile picture upload just a standard file PUT without metadata to a special route
// it can be DELETEd but not edited (as it'll already upsert with PUT and has no caption etc)


// edit will be a restful PUT enacted on the post entity
export const EditRequestSchema = z.object({
    caption: z.string().min(1).max(512).optional()
});
export type EditRequest = z.infer<typeof EditRequestSchema>;
export type EditRequestInput = z.input<typeof EditRequestSchema>;

// deletion request will be restful DELETE enacted on the post/pfp entity with no metadata
