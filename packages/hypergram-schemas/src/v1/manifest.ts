import { z } from "zod";

import { WriteAuthMethodSchema } from "./auth";
import { URLSchema } from "./common";

export const HostManifestSchema = z.object({
    base_url: URLSchema, // canonical base url of this host (what the registry lists, and what signed actions must target)
    name: z.string().min(1).max(64),
    description: z.string().max(512).optional(),
    icon_url: URLSchema.optional(),

    // null for read-only hosts, e.g. an aggregator
    write: z
        .object({
            // base url that /v1/actions is appended to. may be a different origin to base_url, e.g. a shared relay committing to a github pages host
            base_url: URLSchema,
            // accepted auth methods in order of preference, clients use the first they support
            auth: z.array(WriteAuthMethodSchema).min(1),
            // identity hosts whose users may post here, omitted means anyone
            identity_hosts: z.array(z.string()).optional(),
            max_file_bytes: z.number().int().positive()
        })
        .nullable()
});
export type HostManifest = z.infer<typeof HostManifestSchema>;
export type HostManifestInput = z.input<typeof HostManifestSchema>;
