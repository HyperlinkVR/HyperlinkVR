import { z } from "zod";

// the engine itself should only accept absolute urls
export const AbsoluteAssetURLSchema = z.url({
    protocol: /^https?$/,
    //hostname: z.regexes.domain // TODO: test if theres the risk of accessing localhost from a production game with this removed (regex isnt the best way anyway)
}).refine(
    (value) => {
        try {
            const parsed = new URL(value);
            return parsed.protocol === "https:" || parsed.protocol === "http:";
        } catch {
            return false;
        }
    },
    { message: "Asset URLs must be absolute http(s) URLs." }
);
export type AbsoluteAssetURL = z.infer<typeof AbsoluteAssetURLSchema>;
