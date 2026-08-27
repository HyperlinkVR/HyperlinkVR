import { build_breadcrumb_settings_tree } from "@hyperlinkvr/core";
import type { SettingKey} from "@hyperlinkvr/types";
import { settings_def } from "@hyperlinkvr/types";
import { useMemo } from "react";

export const useSettingsTree = (platform: "flat" | "watch") => {
    return useMemo(() => build_breadcrumb_settings_tree(settings_def, platform), [platform]);
}

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
