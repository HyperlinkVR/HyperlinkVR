import {AbsoluteAssetURLSchema} from "@hyperlinkvr/vr-engine-schemas";

export const asset_url = (path: string, field_name: string = "Asset URL"): string => {
    let absolute: string;

    try {
        absolute = new URL(path, document.baseURI).href;
    } catch {
        throw new Error(
            `${field_name} is not a valid URL or path: "${path}" (resolved against ${document.baseURI}).`
        );
    }

    const result = AbsoluteAssetURLSchema.safeParse(absolute);

    if (!result.success) {
        const reasons = result.error.issues.map((issue) => issue.message).join("; ");
        throw new Error(
            `${field_name} resolved to "${absolute}", which the engine will reject: ${reasons}`
        );
    }

    return absolute;
}
