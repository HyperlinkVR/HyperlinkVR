import type { SeparateUIDefinition, Setting, SettingKey, SettingsTree, UISubdefinition } from "@hyperlinkvr/types";
import { settings_def } from "@hyperlinkvr/types";



import type { StorageEngine } from "./storage";


interface SettingsStorageEngines {
    sync?: StorageEngine<"sync">;
    local?: StorageEngine<"local">;
}

const get_storage_engine = (setting: Setting<any>, storage: SettingsStorageEngines): StorageEngine<"sync"> | StorageEngine<"local"> => {
    if (setting.local_only) {
        if (!storage.local) {
            throw new Error(`Setting ${setting.key} is local only, but no local storage engine was provided`);
        }
        return storage.local;
    } else {
        if (!storage.sync) {
            // TODO: should it gracefully fall back to local and then try to sync if a sync engine is provided in future? will error for now to avoid confusion
            throw new Error(`Setting ${setting.key} is synchronised, but no sync storage engine was provided`);
        }
        return storage.sync;
    }
}

export const get_setting = async <K extends SettingKey>(key: K, storage: SettingsStorageEngines): Promise<typeof settings_def[K]["default_value"]> => {
    const setting = settings_def[key];
    const engine = get_storage_engine(setting, storage);

    return await engine.get<typeof setting.default_value>(`settings.${key}`) ?? setting.default_value;
}

export const update_setting = async <K extends SettingKey>(
    key: K,
    value: (typeof settings_def)[K]["default_value"],
    storage: SettingsStorageEngines
): Promise<void> => {
    const setting = settings_def[key];
    const engine = get_storage_engine(setting, storage);

    await engine.set<typeof setting.default_value>(`settings.${key}`, value);
};

export const watch_setting = <K extends SettingKey>(
    key: K,
    callback: (new_value: (typeof settings_def)[K]["default_value"]) => void,
    storage: SettingsStorageEngines
): (() => void) => {
    const setting = settings_def[key];
    const engine = get_storage_engine(setting, storage);

    return engine.watch<typeof setting.default_value>(
        `settings.${key}`,
        (new_value) => {
            if (new_value === null) {
                callback(setting.default_value);
            } else {
                callback(new_value);
            }
        }
    );
};

// TODO: storage is often ratelimited. have local cache but perform debounce on true values. should that be here, or lower in storage engines? or higher in the ui?

// builds a settings tree nested by breadcrumbs for the specified platform (or omitted if missing) TODO: does this belong in types?
export const build_breadcrumb_settings_tree = (
    settings_obj: Record<string, Setting<any>>,
    platform: "flat" | "watch"
): SettingsTree => {
    const result: SettingsTree = { subtrees: {}, settings: [] };

    for (const setting of Object.values(settings_obj)) {
        const ui_def = setting.ui;
        if (!ui_def) continue;

        let subdef: UISubdefinition<any> | undefined;

        if ("common" in ui_def) {
            subdef = ui_def.common;
        } else {
            subdef = (ui_def as SeparateUIDefinition<any>)[platform];
        }

        if (!subdef) continue;

        const breadcrumbs = subdef.breadcrumbs ?? [];
        let current_level = result;

        for (const crumb of breadcrumbs) {
            // if the subtree for this breadcrumb doesn't exist, create it
            if (!current_level.subtrees[crumb]) {
                current_level.subtrees[crumb] = { subtrees: {}, settings: [] };
            }

            // traverse down
            current_level = current_level.subtrees[crumb];
        }

        // add to current level's settings
        current_level.settings.push(setting);
    }

    return result;
};

// TODO: option to override default
// TODO: can settings types safely move here? altho suppose maybe message defs might need them later
