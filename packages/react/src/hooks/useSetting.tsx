import { get_all_settings, get_default_settings, get_setting, StorageEngine, update_setting, watch_all_settings, watch_setting } from "@hyperlinkvr/core";
import type { SettingKey } from "@hyperlinkvr/types";
import { settings_def } from "@hyperlinkvr/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";



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

    subscribe_settings: (cb: () => void) => () => void;
    get_settings_snapshot: () => Record<SettingKey, any>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider = ({ children, debounce_delay = 500 }: { children: React.ReactNode; debounce_delay?: number }) => {
    const storage_engines = useStorageEngines();

    const [uncommited_settings, setUncommitedSettings] = useState<Partial<Record<SettingKey, any>>>({});
    const uncommited_ref = useRef<Partial<Record<SettingKey, any>>>({}); // synchronous mirror for read-your-writes
    const uncommited_watchers_ref = useRef<Partial<Record<SettingKey, Set<(value: any) => void>>>>({});

    // provide an external store for all settings
    const storage_snapshot_ref = useRef<Record<SettingKey, any>>(get_default_settings());
    const merged_ref = useRef<Record<SettingKey, any>>(get_default_settings());
    const listeners_ref = useRef(new Set<() => void>());

    const rebuild_and_notify = useCallback(() => {
        merged_ref.current = { ...storage_snapshot_ref.current, ...uncommited_ref.current };
        for (const l of listeners_ref.current) l();
    }, []);

    const subscribe_settings = useCallback((cb: () => void) => {
        listeners_ref.current.add(cb);
        return () => { listeners_ref.current.delete(cb); };
    }, []);

    const get_settings_snapshot = useCallback(() => merged_ref.current, []);

    // reads uncommited_ref (not state) so this stays reference-stable
    const get_setting_fn = useCallback(
        async <K extends SettingKey>(key: K) => {
            if (key in uncommited_ref.current) {
                return uncommited_ref.current[key] as (typeof settings_def)[K]["default_value"];
            }
            return await get_setting(key, storage_engines);
        },
        [storage_engines]
    );

    const set_setting_fn = useCallback(
        <K extends SettingKey>(key: K, value: (typeof settings_def)[K]["default_value"], skip_debounce = false) => {
            if (skip_debounce) {
                update_setting(key, value, storage_engines);
                return;
            }
            setUncommitedSettings((prev) => ({ ...prev, [key]: value }));
            uncommited_ref.current = { ...uncommited_ref.current, [key]: value };
            rebuild_and_notify();

            for (const callback of uncommited_watchers_ref.current[key] ?? []) {
                try { callback(value); } catch (e) { console.error(`Error in uncommited watcher for setting ${key}:`, e); }
            }
        },
        [storage_engines, rebuild_and_notify]
    );

    // commit uncommited settings to storage after debounce delay (with leading edge)
    const debounced_uncommited_settings = useDebounce(uncommited_settings, debounce_delay, true);
    useEffect(() => {
        const keys_to_commit = Object.keys(debounced_uncommited_settings) as SettingKey[];
        if (keys_to_commit.length === 0) return;

        for (const key of keys_to_commit) {
            update_setting(key, debounced_uncommited_settings[key], storage_engines);
        }
        setUncommitedSettings((prev) => {
            const next = { ...prev };
            for (const key of keys_to_commit) delete next[key];
            return next;
        });
    }, [debounced_uncommited_settings, storage_engines]);

    // sync uncommited_ref with state and rebuild merged snapshot on uncommited_settings change
    useEffect(() => {
        uncommited_ref.current = uncommited_settings;
        rebuild_and_notify();
    }, [uncommited_settings, rebuild_and_notify]);

    const watch_setting_fn = useCallback(
        <K extends SettingKey>(key: K, callback: (value: (typeof settings_def)[K]["default_value"]) => void) => {
            if (!(key in uncommited_watchers_ref.current)) uncommited_watchers_ref.current[key] = new Set();
            uncommited_watchers_ref.current[key]!.add(callback);
            const unlisten_real = watch_setting(key, callback, storage_engines);
            return () => {
                uncommited_watchers_ref.current[key]!.delete(callback);
                unlisten_real();
            };
        },
        [storage_engines]
    );

    // initialise storage snapshot and watch for changes in storage
    useEffect(() => {
        let cancelled = false;
        get_all_settings(storage_engines).then((snapshot) => {
            if (cancelled) return;
            storage_snapshot_ref.current = snapshot;
            rebuild_and_notify();
        });
        const unwatch = watch_all_settings((changes) => {
            for (const [key, change] of Object.entries(changes)) {
                storage_snapshot_ref.current[key as SettingKey] = change.new_value;
            }
            rebuild_and_notify();
        }, storage_engines);
        return () => { cancelled = true; unwatch(); };
    }, [storage_engines, rebuild_and_notify]);

    const value = useMemo(
        () => ({
            get_setting: get_setting_fn,
            set_setting: set_setting_fn,
            watch_setting: watch_setting_fn,
            subscribe_settings,
            get_settings_snapshot
        }),
        [get_setting_fn, set_setting_fn, watch_setting_fn, subscribe_settings, get_settings_snapshot]
    );

    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};


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

export const useAllSettings = () => {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useAllSettings must be used within a SettingsProvider");
    return useSyncExternalStore(ctx.subscribe_settings, ctx.get_settings_snapshot);
};

export const useSettingsSnapshotStore = () => {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useSettingsSnapshotStore must be used within a SettingsProvider");
    return {
        subscribe: ctx.subscribe_settings,
        get_snapshot: ctx.get_settings_snapshot
    };
};
