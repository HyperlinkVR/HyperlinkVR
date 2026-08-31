import { useSetting, useSettingUIDefinition } from "@hyperlinkvr/react";
import type {
    SettingValueType,
    WidgetArguments,
    WidgetType
} from "@hyperlinkvr/types";
import {
    type SettingKey
} from "@hyperlinkvr/types";
import { useMemo } from "react";

import { Dropdown } from "./Dropdown";
import { SmartSlider } from "./SmartSlider";
import { ToggleSwitch } from "./ToggleSwitch";


type WidgetLookup<V extends SettingValueType> = {
    [K in WidgetType<V>]: React.ComponentType<WidgetArguments<K> & {value: V; on_change: (value: V) => void; label: string}>;
};

const widget_lookup: Partial<WidgetLookup<any>> = {
    "range": SmartSlider,
    "switch": ToggleSwitch,
    "select": Dropdown
}

export const FlatSettingWidget = ({setting_key, enabled = true}: {setting_key: SettingKey, enabled?: boolean}) => {
    const [value, setValue] = useSetting(setting_key);
    const ui_def = useSettingUIDefinition(setting_key, "flat");

    const WidgetComponent = useMemo(() => {
        if (!ui_def) {
            console.warn(`No UI definition found for setting key: ${setting_key}`);
            return null;
        }

        const widget_type = ui_def.widget.type;
        const component = widget_lookup[widget_type];

        if (!component) {
            console.warn(`No component found for widget type: ${widget_type}`);
            return null;
        }

        return component as React.ComponentType<any>; // its guaranteed safe here by the widget lookup, but typescript is getting lost due to its limits around unions
    }, [ui_def]);

    if (!ui_def || !WidgetComponent) {
        return null;
    }

    // TODO: handle description. either add to component or wrap it

    return <WidgetComponent value={value} on_change={setValue} label={ui_def.label} enabled={enabled} {...ui_def.widget} />;
}
