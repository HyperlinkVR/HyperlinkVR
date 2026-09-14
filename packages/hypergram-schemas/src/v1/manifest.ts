import { z } from "zod";

export const HostManifestSchema = z.object({
    name: z.string().optional(),
    bases: z.object({
        write: z.httpUrl().optional(),
        auth: z.httpUrl().optional()
    }).optional(),
    auth: z.object({
        login: z.boolean(),
        web: z.boolean()
    }).refine(obj => obj.login || !obj.web, {
        error: "Cannot permit web login when login is not permitted at all!"
    })
});
export type HostManifest = z.infer<typeof HostManifestSchema>;
export type HostManifestInput = z.input<typeof HostManifestSchema>;
