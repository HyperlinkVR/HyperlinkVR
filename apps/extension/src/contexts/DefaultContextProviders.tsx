import type { MessageEngine, WindowArgumentsStrategy } from "@hyperlinkvr/core";
import { URLParamsWindowArgumentsStrategy } from "@hyperlinkvr/platform-browser";
import {
    ExtensionMessageEngine,
    ExtensionStorage
} from "@hyperlinkvr/platform-extension";
import type {
    StorageEnginesContextType} from "@hyperlinkvr/react";
import {
    AuthSessionProvider,
    MessageEngineProvider, SettingsProvider,
    StorageEnginesProvider,
    WindowArgumentsStrategyProvider
} from "@hyperlinkvr/react";

let _default_messenger: MessageEngine | undefined;
let _default_storage_engines: StorageEnginesContextType | undefined;
let _default_window_args_strategy: WindowArgumentsStrategy<unknown> | undefined;

const get_default_messenger = () =>
    (_default_messenger ??= new ExtensionMessageEngine());

const get_default_storage_engines = () =>
    (_default_storage_engines ??= {
        local: new ExtensionStorage("local"),
        sync: new ExtensionStorage("sync"),
        session: new ExtensionStorage("session")
    });

const get_default_window_args_strategy = () =>
    (_default_window_args_strategy ??= new URLParamsWindowArgumentsStrategy());

export const DefaultContextProviders = ({
    children,
    messenger,
    storage_engines,
    window_args_strategy
}: {
    children: React.ReactNode;
    messenger?: MessageEngine;
    storage_engines?: StorageEnginesContextType;
    window_args_strategy?: WindowArgumentsStrategy<unknown>;
}) => {
    const resolved_messenger = messenger ?? get_default_messenger();
    const resolved_storage_engines =
        storage_engines ?? get_default_storage_engines();
    const resolved_window_args_strategy =
        window_args_strategy ?? get_default_window_args_strategy();

    return (
        <MessageEngineProvider engine={resolved_messenger}>
            <StorageEnginesProvider engines={resolved_storage_engines}>
                <SettingsProvider>
                    <WindowArgumentsStrategyProvider
                        strategy={resolved_window_args_strategy}>
                        <AuthSessionProvider>{children}</AuthSessionProvider>
                    </WindowArgumentsStrategyProvider>
                </SettingsProvider>
            </StorageEnginesProvider>
        </MessageEngineProvider>
    );
};
