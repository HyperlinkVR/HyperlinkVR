import type { StorageEngine} from "@hyperlinkvr/core";
import { get_setting, update_setting, watch_setting } from "@hyperlinkvr/core";
import type { SettingKey} from "@hyperlinkvr/types";
import { settings_def } from "@hyperlinkvr/types";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";



import { useStorageEngines } from "../contexts";
import { useDebounce } from "./useDebounce";


export const useSettingWithEngines = <K extends SettingKey>(
    key: K,
    storage: { sync?: StorageEngine<"sync">; local?: StorageEngine<"local"> },
    debounce_delay = 500
) => {
    const [value, setValue] = useState<(typeof settings_def)[K]["default_value"]>(
        settings_def[key].default_value
    );

    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        get_setting(key, storage).then((stored) => {
            setValue(stored);
            setLoaded(true);
        });
    }, [key, get_setting]);

    const update_value = useCallback(
        (new_value: (typeof settings_def)[K]["default_value"]) => {
            //update_setting(key, new_value, storage);
            setValue(new_value);
        },
        [key, storage]
    );

    // debounce setting updates (set delay to 0 to disable, but not recommended)
    // with leading edge for quick responses to one off events
    const debounced_value = useDebounce(value, debounce_delay, true);

    useEffect(() => {
        update_setting(key, debounced_value, storage);
    }, [key, debounced_value, storage]);

    return [value, update_value, loaded] as const;
};

export const useSettingWithoutContext = <K extends SettingKey>(key: K, debounce_delay = 500) => {
    const storage_engines = useStorageEngines();
    return useSettingWithEngines(key, storage_engines, debounce_delay);
};

interface SettingsContextType {
    get_setting: <K extends SettingKey>(key: K) => Promise<(typeof settings_def)[K]["default_value"]>;
    set_setting: <K extends SettingKey>(key: K, value: (typeof settings_def)[K]["default_value"], skip_debounce?: boolean) => void;
    watch_setting: <K extends SettingKey>(key: K, callback: (value: (typeof settings_def)[K]["default_value"]) => void) => () => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider = ({ children, debounce_delay = 500 }: { children: React.ReactNode; debounce_delay?: number }) => {
    const storage_engines = useStorageEngines();

    // used to expose realtime settings to consumers, but not persisted until debounced
    // stores "overridden" values that have not yet been persisted to storage but will be read back
    const [uncommited_settings, setUncommitedSettings] = useState<Partial<Record<SettingKey, any>>>({});
    const uncommited_watchers_ref = useRef<Partial<Record<SettingKey, Set<(value: any) => void>>>>({});

    const get_setting_fn = useCallback(
        async <K extends SettingKey>(key: K) => {
            if (key in uncommited_settings) {
                return uncommited_settings[key] as (typeof settings_def)[K]["default_value"];
            }
            return await get_setting(key, storage_engines);
        },
        [uncommited_settings]
    );

    const set_setting_fn = useCallback(
        <K extends SettingKey>(key: K, value: (typeof settings_def)[K]["default_value"], skip_debounce = false) => {
            if (skip_debounce) {
                update_setting(key, value, storage_engines);
            } else {
                setUncommitedSettings((prev) => ({ ...prev, [key]: value }));

                // notify uncommited watchers immediately
                if (key in uncommited_watchers_ref.current) {
                    for (const callback of uncommited_watchers_ref.current[key]!) {
                        try {
                            callback(value);
                        } catch (e) {
                            console.error(`Error in uncommited watcher for setting ${key}:`, e);
                        }
                    }
                }
            }
        },
        [storage_engines]
    );

    // commit uncommited settings to storage after debounce delay (with leading edge)
    const debounced_uncommited_settings = useDebounce(uncommited_settings, debounce_delay, true);
    useEffect(() => {
        const keys_to_commit = Object.keys(debounced_uncommited_settings) as SettingKey[];
        if (keys_to_commit.length === 0) return;

        console.log(`Committing settings: ${keys_to_commit.join(", ")}`, debounced_uncommited_settings);

        for (const key of keys_to_commit) {
            const value = debounced_uncommited_settings[key];
            update_setting(key as SettingKey, value, storage_engines);
        }

        // clear only the committed keys for safety
        setUncommitedSettings((prev) => {
            const new_state = { ...prev };
            for (const key of keys_to_commit) {
                delete new_state[key];
            }
            return new_state;
        });
    }, [debounced_uncommited_settings, storage_engines]);

    const watch_setting_fn = useCallback(
        <K extends SettingKey>(key: K, callback: (value: (typeof settings_def)[K]["default_value"]) => void) => {
            if (!(key in uncommited_watchers_ref.current)) {
                uncommited_watchers_ref.current[key] = new Set();
            }
            uncommited_watchers_ref.current[key]!.add(callback);

            const unlisten_real = watch_setting(key, callback, storage_engines);

            return () => {
                uncommited_watchers_ref.current[key]!.delete(callback);
                unlisten_real();
            };
        },
        [storage_engines]
    );

    return (
        <SettingsContext.Provider value={{ get_setting: get_setting_fn, set_setting: set_setting_fn, watch_setting: watch_setting_fn }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSetting = <K extends SettingKey>(key: K, debounce_delay = 500) => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error("useSetting must be used within a SettingsProvider. You can use useSettingWithoutContext if you don't want to use the provider (but it's recommended you do!)");
    }

    const { get_setting, set_setting, watch_setting } = context;

    const [value, setValue] = useState<(typeof settings_def)[K]["default_value"]>(settings_def[key].default_value);

    const [loaded, setLoaded] = useState(false);

    // get default value from storage on mount
    useEffect(() => {
        get_setting(key).then((stored) => {
            setValue(stored);
            setLoaded(true);
        });
    }, [key, get_setting]);

    // subscribe to changes in the setting value
    useEffect(() => {
        const unlisten = watch_setting(key, setValue);
        return unlisten;
    }, [key, watch_setting]);

    const update_value = useCallback(
        (new_value: (typeof settings_def)[K]["default_value"]) => {
            set_setting(key, new_value);
            setValue(new_value);
        },
        [key, set_setting]
    );

    return [value, update_value, loaded] as const;
}
