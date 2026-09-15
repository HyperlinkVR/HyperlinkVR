import { get_device_profile, watch_setting } from "@hyperlinkvr/core";
import { DeviceProfile } from "@hyperlinkvr/types";
import { useEffect, useState } from "react";



import { useStorageEngine } from "../contexts";


export const useDeviceProfile = (bypass_emulation = false) => {
    const local_storage = useStorageEngine("local");
    const [profile, setProfile] = useState<DeviceProfile | null>(null);

    useEffect(() => {
        get_device_profile(local_storage, bypass_emulation).then((detected_profile) => {
            setProfile(detected_profile);
        });
    }, []);

    useEffect(() => {
        if (bypass_emulation) {
            return;
        }

        const unsubscribe = watch_setting(
            "devtools_emulated_device_profile",
            (emulated_profile) => {
                if (emulated_profile) {
                    setProfile(emulated_profile);
                } else {
                    get_device_profile(local_storage, bypass_emulation).then(
                        (detected_profile) => {
                            setProfile(detected_profile);
                        }
                    );
                }
            },
            { local: local_storage }
        );

        return () => {
            unsubscribe();
        };
    }, [local_storage, bypass_emulation]);

    return profile;
}

// while a context is technically more correct to prevent multiple setting watchers, using a hook means the detection calculation is only done when needed
