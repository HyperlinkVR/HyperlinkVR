import type * as WebSDK from "@hyperlinkvr/web-sdk";

declare global {
    // injected by the extension at runtime, typed from the workspace package
    const hyperlinkvr: typeof WebSDK;
}

export {};
