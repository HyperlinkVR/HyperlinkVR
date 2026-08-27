import type { WebSDKActionName } from "@hyperlinkvr/types";


import * as auth_handlers from "./auth";
import type { Handler, HandlerData, HandlerMap } from "./types";

export * from "./types";

export * from "./auth";

export const builtin_handlers = {
    HVRSDK_AUTH_QUERY: auth_handlers.query,
    HVRSDK_AUTH_WHOAMI: auth_handlers.whoami
} satisfies Partial<HandlerMap>;
export type HandleableAction = keyof typeof builtin_handlers;

export const handle_web_sdk = async <K extends WebSDKActionName>(data: HandlerData<K>) => {
    const { message } = data;
    if (!(message.action in builtin_handlers)) {
        // deferred action, we cant answer it ourselves
        return null;
    }

    const handler = builtin_handlers[message.action as HandleableAction] as unknown as Handler<K>;
    return handler(data);
};
