export type WindowIntent =
    "VR_HOST"
    | "SETTINGS"
    | "LOGIN"
    | "DEVTOOLS"
    | "DEVTOOLS_FORM"
    | "DEVTOOLS_WATCH_UI"
    | "DEVTOOLS_SPY";
// TODO: finish

// TODO: type per intent
export type WindowArguments = Record<string, any>;

export const CONTENT_FRAME_NAME = "hvr-content-frame";
