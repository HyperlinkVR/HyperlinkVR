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

export const get_all_settings = async (storage: SettingsStorageEngines): Promise<Record<SettingKey, any>> => {
    const result: Partial<Record<SettingKey, any>> = {};

    for (const engine_kind of Object.keys(storage)) {
        const engine = storage[engine_kind as keyof SettingsStorageEngines];
        if (!engine) continue;

        const entries = await engine.entries<any>("settings.");
        for (const [key, value] of Object.entries(entries)) {
            const setting_key = key.replace(/^settings\./, "") as SettingKey;
            if (!(setting_key in settings_def)) continue;   // ignore orphaned keys
            if (get_storage_engine(settings_def[setting_key], storage) !== engine) continue; // ignore keys that no longer belong to this engine (e.g. if a setting was changed from sync to local)
            result[setting_key] = value ?? settings_def[setting_key].default_value;
        }
    }

    // fill in any missing settings with their default values
    for (const key of Object.keys(settings_def) as SettingKey[]) {
        if (!(key in result)) {
            result[key] = settings_def[key].default_value;
        }
    }

    return result as Record<SettingKey, any>;
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

export const watch_all_settings = (
    callback: (changes: Partial<Record<SettingKey, { new_value?: any }>>) => void,
    storage: SettingsStorageEngines
): (() => void) => {
    const unsubscribes: (() => void)[] = [];

    for (const engine_kind of Object.keys(storage)) {
        const engine = storage[engine_kind as keyof SettingsStorageEngines];
        if (!engine) continue;

        const unsubscribe = engine.watch_all((changes) => {
            const filtered_changes: Partial<Record<SettingKey, { new_value?: any }>> = {};
            for (const [key, change] of Object.entries(changes)) {
                const setting_key = key.replace(/^settings\./, "") as SettingKey;
                if (!(setting_key in settings_def)) continue;   // ignore orphaned keys
                if (get_storage_engine(settings_def[setting_key], storage) !== engine) continue; // ignore keys that no longer belong to this engine (e.g. if a setting was changed from sync to local)
                filtered_changes[setting_key] = {
                    new_value: change!.new_value ?? settings_def[setting_key].default_value
                };
            }
            callback(filtered_changes);
        });

        unsubscribes.push(unsubscribe);
    }

    return () => {
        for (const unsubscribe of unsubscribes) {
            unsubscribe();
        }
    };
};

export const get_default_settings = (): Record<SettingKey, any> => {
    const result: Partial<Record<SettingKey, any>> = {};

    for (const [key, setting] of Object.entries(settings_def)) {
        result[key as SettingKey] = setting.default_value;
    }

    return result as Record<SettingKey, any>;
};

// TODO: storage is often ratelimited. have local cache but perform debounce on true values. should that be here, or lower in storage engines? or higher in the ui?
// note that the react context already does this, but might be good to do in the core instead

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

export const collect_settings_in_tree = (tree: SettingsTree): Setting<any>[] => [
    ...tree.settings,
    ...Object.values(tree.subtrees).flatMap(collect_settings_in_tree)
];

// TODO: option to override default
// TODO: can settings types safely move here? altho suppose maybe message defs might need them later
