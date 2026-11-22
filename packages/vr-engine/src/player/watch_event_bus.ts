import { ScreenName } from "@hyperlinkvr/watch-ui";





interface BaseWatchEvent {}

export interface WatchNavigateEvent extends BaseWatchEvent {
    type: "navigate";
    screen: ScreenName;
    args?: Record<string, unknown>;
}

export interface WatchShowModalScreenEvent<TResult = unknown>
    extends BaseWatchEvent {
    type: "show_modal_screen";
    screen: ScreenName;
    args?: Record<string, unknown>;
    resolve?: (result: TResult) => void;
    dismiss_value?: TResult;
    close_on_resolve?: boolean;
}

export type WatchEvent<TResult = unknown> =
    | WatchNavigateEvent
    | WatchShowModalScreenEvent<TResult>;

type WatchEventListener<TResult = unknown> = (event: WatchEvent<TResult>) => void;

const listeners = new Set<WatchEventListener<any>>();

export const add_watch_event_listener = (listener: WatchEventListener<any>) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

export const dispatch_watch_event = <TResult = unknown>(
    event: WatchEvent<TResult>
) => {
    for (const listener of listeners) {
        listener(event);
    }
};

export const request_watch_modal = function<TResult = unknown>(
    screen: ScreenName,
    args: Record<string, unknown> | undefined,
    dismiss_value: TResult,
    close_on_resolve = true
): Promise<TResult> {
    return new Promise<TResult>((resolve) => {
        let settled = false;
        const settle = (value: TResult) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        dispatch_watch_event({
            type: "show_modal_screen",
            screen,
            args,
            resolve: settle,
            dismiss_value,
            close_on_resolve
        });
    });
}
