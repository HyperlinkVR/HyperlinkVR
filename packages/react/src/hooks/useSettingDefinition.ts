import { build_breadcrumb_settings_tree } from "@hyperlinkvr/core";
import type { SettingKey } from "@hyperlinkvr/types";
import { settings_def } from "@hyperlinkvr/types";
import { useMemo, useSyncExternalStore } from "react";
import { useSettingsSnapshotStore } from "./useSetting";


export const useSettingsTree = (platform: "flat" | "watch") => {
    return useMemo(() => build_breadcrumb_settings_tree(settings_def, platform), [platform]);
}

// TODO: why is this even a hook lol
export const useSettingDefinition = (key: SettingKey) => {
    return useMemo(() => settings_def[key], [key]);
}

export const useSettingUIDefinition = (key: SettingKey, platform: "flat" | "watch") => {
    const setting = useSettingDefinition(key);
    return useMemo(() => {
        if (!setting.ui) {
            return null;
        }

        if ("common" in setting.ui) {
            return setting.ui.common;
        } else if (platform in setting.ui) {
            return setting.ui[platform];
        } else {
            return null;
        }
    }, [setting, platform]);
}
// useful define here in case more advanced override logic comes later, want to give the platform a clean view of the ui def they need

// evaluate setting conditional when any setting changes using store sync
export const useSettingVisible = (
    key: SettingKey,
    settings_platform: "flat" | "watch",
    watch_play_mode?: "vr" | "flat"
) => {
    const ui = useSettingUIDefinition(key, settings_platform);
    const conditional = ui?.conditional;

    const { subscribe, get_snapshot } = useSettingsSnapshotStore();

    return useSyncExternalStore(
        subscribe,
        () => (conditional ? conditional(get_snapshot(), watch_play_mode) : true)
    );
};

// for subtrees to bail if no children are visible
export const useAnySettingVisible = (
    keys: SettingKey[],
    settings_platform: "flat" | "watch",
    watch_play_mode?: "vr" | "flat"
) => {
    const { subscribe, get_snapshot } = useSettingsSnapshotStore();

    return useSyncExternalStore(
        subscribe,
        () => {
            for (const key of keys) {
                const ui = settings_def[key].ui;
                if (!ui) continue;

                let conditional: ((settings: Record<SettingKey, any>, watch_play_mode?: "vr" | "flat") => boolean) | undefined;
                if ("common" in ui) {
                    conditional = ui.common.conditional;
                } else if (settings_platform in ui) {
                    conditional = ui[settings_platform]!.conditional;
                }

                if (!conditional || conditional(get_snapshot(), watch_play_mode)) {
                    return true;
                }
            }
            return false;
        }
    );
};
