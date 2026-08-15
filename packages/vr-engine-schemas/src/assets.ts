import { z } from "zod";

// prevent the engine accidentally fetching the asset url directly, which breaks the privilege boundary
// ideally we would defer the fetch to the sdk, but blob handles arent serialisable and transmitting the file as bytes over rtc is miserable
// TODO: maybe at a later stage we could do this, but only if people care enough to want it
// instead we'll just have a dev mode toggle in the settings that allows local fetching, and use targetAddressSpace: "public" when its disabled
// we can also just safely allow localhost urls to bypass this via string matching, as the case we get tricked by dns makes it more restrictive!
// we'll keep the toggle for people with weird use cases but will be obnoxious about it when its enabled

// the asset ref serves as a wrapper/"condom" around the url to make sure the engine does the necessary checks before fetching it
// once the engine is happy (i.e. fetches it with targetAddressSpace: "public"), it can then hand the blob url back to the sdk

// the reason we can't just look for localhost as a string is because dns allows you to map your domain to a local ip
// (yes, i have spent hours raging at this and how js devs are completely out of luck for any way of preventing this without sweeping yes or no permissions for all fetches)

// extensions bypass LNA, and even if it was in browser, it'd still be LNA dedicated to the whole game's origin, not per world

export class AssetRef {
    readonly #url: string;

    constructor(url: string) {
        this.#url = url;
    }

    // only to be used in the unwrapping, can be grep'd for any offending uses easily
    dangerously_get_source_url(): string {
        return this.#url;
    }

    // serialised state (multiplayer sync, storage) carries plain URL strings
    toJSON(): string {
        return this.#url;
    }

    toString(): string {
        console.error(
            "AssetRef coerced to string outside the asset pipeline. This asset URL was not fetched.",
            new Error().stack
        );
        return "hvr-blocked-asset:";
    }
}

export const is_asset_ref = (value: unknown): value is AssetRef => value instanceof AssetRef;

const is_absolute_http_url = (value: string): boolean => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
};

// validation only
export const AssetURLStringSchema = z.string().refine(is_absolute_http_url, {
    message: "Asset URLs must be absolute http(s) URLs."
});

// ensure the engine only recieves an assetref
export const AbsoluteAssetURLSchema = AssetURLStringSchema.transform(
    (url) => new AssetRef(url)
);

export type AbsoluteAssetURL = z.infer<typeof AbsoluteAssetURLSchema>;
export type AbsoluteAssetURLInput = z.input<typeof AbsoluteAssetURLSchema>;
