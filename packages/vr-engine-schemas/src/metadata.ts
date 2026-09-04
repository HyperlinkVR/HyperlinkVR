import { z } from "zod";


import { AbsoluteAssetURLSchema } from "./assets";
import { HexColorSchema } from "./colors";

export const WorldAuthorSchema = z.object({
    username: z.string().min(3).max(64), // TODO: proper schema that lives in auth for name@host.xyz
    signature: z.string().optional(), // for main author, required to make world accessible (unless allow unsigned worlds enabled). for additional contributors, only needed for verification mark
});

export type WorldAuthor = z.infer<typeof WorldAuthorSchema>;
export type WorldAuthorInput = z.input<typeof WorldAuthorSchema>;

export const ContributorRoleSchema = z.enum([
    "contributor",
    "co-owner",
    "developer",
    "designer",
    "artist",
    "musician",
    "tester",
    "manager",
    "social",
    "hosting",
    "shoutout",
    "other"
]);
export type ContributorRole = z.infer<typeof ContributorRoleSchema>;

export const WorldContributorSchema = z.union([
    WorldAuthorSchema.extend({
        role: ContributorRoleSchema.default("contributor")
    }),

    // or just username
    z.string().min(3).max(64)
])
    .transform(c =>
        typeof c === "string"
            ? { username: c, role: "contributor" as const, signature: undefined }
            : c
    );

export type WorldContributor = z.infer<typeof WorldContributorSchema>;
export type WorldContributorInput = z.input<typeof WorldContributorSchema>;

export const PlatformSupportSchema = z.enum(["no", "maybe", "yes"]);
export type PlatformSupport = z.infer<typeof PlatformSupportSchema>;

export const WorldPlatformSupportSchema = z.object({
    vr: PlatformSupportSchema.default("maybe"),
    flat: PlatformSupportSchema.default("maybe"),

    low_power: PlatformSupportSchema.default("maybe"),
    teleport: z.boolean().default(true)
});
export type WorldPlatformSupport = z.infer<typeof WorldPlatformSupportSchema>;
export type WorldPlatformSupportInput = z.input<typeof WorldPlatformSupportSchema>;

export const ContentFlagSchema = z.enum([
    "cartoon_violence",
    "realistic_violence",
    "intense_violence",
    "sexual_content",
    "mild_horror",
    "horror",
    "drugs",
    "strong_language",
    "gambling",
    "flashing_lights",
    "loud_sounds",
    "ugc",
    "real_money",
    "other"
]);
export type ContentFlag = z.infer<typeof ContentFlagSchema>;

export const VRComfortSchema = z.enum(["comfortable", "moderate", "intense"]);
export type VRComfort = z.infer<typeof VRComfortSchema>;

export const CategorySchema = z.enum([
    "social",
    "game",
    "art",
    "music",
    "education",
    "utility",
    "spatial_computing",
    "other"
]);
export type Category = z.infer<typeof CategorySchema>;

export const BCP47Schema = z.string().refine((value => {
    try {
        new Intl.Locale(value);
        return true;
    } catch {
        return false;
    }
}), { message: "Invalid BCP 47 language tag" });
export type BCP47 = z.infer<typeof BCP47Schema>;

const WorldMetadataSchema_VERSION = 1;
export const WorldMetadataSchema = z.object({
    $schema: z
        .string()
        .optional()
        .default(
            `https://hyperlink.surf/schemas/WorldMetadata_v${WorldMetadataSchema_VERSION}.json`
        ),
    version: z.number().int().min(1).max(WorldMetadataSchema_VERSION),

    title: z.string().min(2).max(32),
    description: z.string().max(512).optional(),

    category: CategorySchema.optional(),
    tags: z.array(z.string().min(1).max(16).regex(/^[\p{L}\p{N}_-]+$/u, { message: "Only letters, -, and _ are allowed", })).max(8).optional(),

    author: WorldAuthorSchema.optional(),
    additional_contributors: z.array(WorldContributorSchema).max(20).optional(),

    thumbnail: AbsoluteAssetURLSchema.optional(),
    gallery: z.array(AbsoluteAssetURLSchema).max(5).optional(),
    theme_color: HexColorSchema.optional(),

    supports: WorldPlatformSupportSchema.default({
        vr: "maybe",
        flat: "maybe",
        low_power: "maybe",
        teleport: true
    }),

    languages: z.union([
        z.literal("any"),
        z.array(BCP47Schema).min(1)
    ]).default("any"),

    max_players: z.number().int().min(1).max(32).default(32),
    recommended_players: z.number().int().min(1).max(32).default(8),

    content_flags: z.array(ContentFlagSchema).optional(),
    vr_comfort: VRComfortSchema.optional(),

    preloads: z.array(AbsoluteAssetURLSchema).max(64).optional(),

    endorsements: z.array(z.url({
        protocol: /^https?$/,
        hostname: z.regexes.domain
    })).max(20).optional(),

    homepage: z.url().optional(),
    repo: z.url().optional(),
    license_spdx: z.string().optional(),
})
    .superRefine((data, ctx) => {
        if (data.recommended_players > data.max_players) {
            ctx.addIssue({
                code: "custom",
                message: "recommended_players cannot be greater than max_players"
            });
        }
    })
    .meta({
        name: "WorldMetadata",
        version: WorldMetadataSchema_VERSION,
        title: "HyperlinkVR - World Metadata",
        description: "Metadata for a HyperlinkVR world, including title, description, author, and thumbnail.",

        // enforce in json schema that recommended_players cannot be greater than max_players
        json_schema_extra: {
            if: {
                properties: {
                    recommended_players: { type: "number" },
                    max_players: { type: "number" }
                },
                required: ["recommended_players", "max_players"]
            },
            then: {
                properties: {
                    recommended_players: {
                        type: "number",
                        maximum: { $data: "1/max_players" }
                    }
                }
            }
        }
    });

export type WorldMetadata = z.infer<typeof WorldMetadataSchema>;
export type WorldMetadataInput = z.input<typeof WorldMetadataSchema>;

export const FeaturedWorldsRowSchema = z.object({
    title: z.string().max(64).optional(),
    description: z.string().max(128).optional(),
    worlds: z.array(z.url({
        protocol: /^https?$/,
        hostname: z.regexes.domain
    })).min(1).max(32)
});
export type FeaturedWorldsRow = z.infer<typeof FeaturedWorldsRowSchema>;
export type FeaturedWorldsRowInput = z.input<typeof FeaturedWorldsRowSchema>;

const FeaturedWorldsSchema_VERSION = 1;
export const FeaturedWorldsSchema = z.object({
    $schema: z
        .string()
        .optional()
        .default(
            `https://hyperlink.surf/schemas/FeaturedWorlds_v${FeaturedWorldsSchema_VERSION}.json`
        ),
    version: z.number().int().min(1).max(FeaturedWorldsSchema_VERSION),

    rows: z.array(FeaturedWorldsRowSchema).max(16)
}).meta({
    name: "FeaturedWorlds",
    version: FeaturedWorldsSchema_VERSION,
    title: "HyperlinkVR - Featured Worlds Definition",
    description: "Metadata for a service provider to set rows of featured worlds."
});


export type FeaturedWorlds = z.infer<typeof FeaturedWorldsSchema>;
export type FeaturedWorldsInput = z.input<typeof FeaturedWorldsSchema>;

export const METADATA_EXPORT_TO_JSON = [
    WorldMetadataSchema,
    FeaturedWorldsSchema
];
