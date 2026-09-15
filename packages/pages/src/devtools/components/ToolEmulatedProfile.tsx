import { useDeviceProfile, useSetting } from "@hyperlinkvr/react";
import { DeviceProfile, GPUFamily } from "@hyperlinkvr/types";
import { ToggleSwitch } from "@hyperlinkvr/ui-dom/settings";
import { Cpu, Info, RefreshCw } from "lucide-react";
import { useState } from "react";





const GPU_FAMILIES: GPUFamily[] = [
    "adreno",
    "mali",
    "powervr",
    "apple",
    "desktop",
    "unknown"
];

const DEVICE_PRESETS: Record<
    string,
    { label: string; profile: DeviceProfile }
> = {
    quest2: {
        label: "Meta Quest 2 / Pico 4 (Adreno 650)",
        profile: {
            low_power: true,
            is_standalone: true,
            gpu: "Adreno (TM) 650",
            gpu_family: "adreno",
            detected_via: "gpu"
        }
    },
    quest3: {
        label: "Meta Quest 3 / Quest 3S / Pico 4 Ultra (Adreno 740)",
        profile: {
            low_power: true,
            is_standalone: true,
            gpu: "Adreno (TM) 740",
            gpu_family: "adreno",
            detected_via: "gpu"
        }
    },
    mali_standalone: {
        label: "Mali Mobile / Standalone (Mali-G76)",
        profile: {
            low_power: true,
            is_standalone: true,
            gpu: "Mali-G76",
            gpu_family: "mali",
            detected_via: "gpu"
        }
    },
    apple_vision: {
        label: "Apple Vision Pro (Apple M2)",
        profile: {
            low_power: false,
            is_standalone: true,
            gpu: "Apple M2 GPU",
            gpu_family: "apple",
            detected_via: "gpu"
        }
    },
    apple_mobile: {
        label: "iPhone / iPad (Apple GPU)",
        profile: {
            low_power: true,
            is_standalone: false,
            gpu: "Apple GPU",
            gpu_family: "apple",
            detected_via: "gpu"
        }
    },
    pcvr_nvidia: {
        label: "PCVR High-End (NVIDIA RTX 4080)",
        profile: {
            low_power: false,
            is_standalone: false,
            gpu: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)",
            gpu_family: "desktop",
            detected_via: "gpu"
        }
    },
    pcvr_integrated: {
        label: "PC Low-End / Integrated (Intel UHD/Iris)",
        profile: {
            low_power: true,
            is_standalone: false,
            gpu: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)",
            gpu_family: "desktop",
            detected_via: "gpu"
        }
    },
    ua_fallback_standalone: {
        label: "UA Fallback - Standalone (No WebGL string)",
        profile: {
            low_power: true,
            is_standalone: true,
            gpu: null,
            gpu_family: "unknown",
            detected_via: "user_agent"
        }
    },
    ua_fallback_generic: {
        label: "UA Fallback - Generic Desktop / Mobile",
        profile: {
            low_power: false,
            is_standalone: false,
            gpu: null,
            gpu_family: "unknown",
            detected_via: "default"
        }
    }
};

const DEFAULT_CUSTOM_PROFILE: DeviceProfile = {
    low_power: true,
    is_standalone: true,
    gpu: "Custom Emulated GPU",
    gpu_family: "adreno",
    detected_via: "default"
};

export const ToolDeviceProfileEmulation = () => {
    const [emulated_profile, setEmulatedProfile] = useSetting("devtools_emulated_device_profile");
    const live_profile = useDeviceProfile();

    const [show_custom, setShowCustom] = useState(false);

    // find active profile preset key if it matches the current emulated profile
    const active_preset_key = Object.keys(DEVICE_PRESETS).find((key) => {
        const preset = DEVICE_PRESETS[key]!.profile;

        return (
            emulated_profile?.gpu === preset.gpu &&
            emulated_profile?.gpu_family === preset.gpu_family &&
            emulated_profile?.low_power === preset.low_power &&
            emulated_profile?.tier === preset.tier &&
            emulated_profile?.is_standalone === preset.is_standalone
        );
    });

    const is_custom = emulated_profile && !active_preset_key;
    const select_value = active_preset_key ?? (is_custom ? "custom" : "auto");

    const handle_select_change = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === "auto") {
            setEmulatedProfile(null);
            setShowCustom(false);
        } else if (val === "custom") {
            setEmulatedProfile(emulated_profile ?? DEFAULT_CUSTOM_PROFILE);
            setShowCustom(true);
        } else if (DEVICE_PRESETS[val]) {
            setEmulatedProfile(DEVICE_PRESETS[val].profile);
            setShowCustom(false);
        }
    };

    const update_custom_field = <K extends keyof DeviceProfile>(
        field: K,
        value: DeviceProfile[K]
    ) => {
        const current = emulated_profile ?? DEFAULT_CUSTOM_PROFILE;
        setEmulatedProfile({
            ...current,
            [field]: value
        });
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <label className="text-gray-200 text-sm font-medium flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    Device profile emulation

                    <span className="cursor-help" title={"Emulate a specific device profile for testing purposes. This will override the actual hardware profile detected by the browser.\nThis does NOT throttle the CPU or GPU, it only changes the reported device profile."}>
                        <Info />
                    </span>
                </label>
                {emulated_profile && (
                    <button
                        onClick={() => {
                            setEmulatedProfile(null);
                            setShowCustom(false);
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition cursor-pointer"
                        title="Reset to Auto-Detect">
                        <RefreshCw className="w-3 h-3" /> Reset
                    </button>
                )}
            </div>

            <select
                value={select_value}
                onChange={handle_select_change}
                className="w-full bg-black/40 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition cursor-pointer">
                <option value="auto">Actual hardware</option>
                <optgroup label="Presets">
                    {Object.entries(DEVICE_PRESETS).map(([key, { label }]) => (
                        <option key={key} value={key}>
                            {label}
                        </option>
                    ))}
                </optgroup>
                <option value="custom">Custom profile...</option>
            </select>

            {(show_custom || is_custom) && emulated_profile && (
                <div className="flex flex-col gap-3 p-3 bg-black/40 rounded-lg border border-white/10 mt-1">
                    <ToggleSwitch
                        label="Low power?"
                        value={emulated_profile.low_power}
                        on_change={(val) => update_custom_field("low_power", val)}
                    />

                    <ToggleSwitch
                        label="Is standalone?"
                        value={emulated_profile.is_standalone}
                        on_change={(val) =>
                            update_custom_field("is_standalone", val)
                        }
                    />

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-300">
                            GPU family
                        </label>
                        <select
                            value={emulated_profile.gpu_family}
                            onChange={(e) =>
                                update_custom_field(
                                    "gpu_family",
                                    e.target.value as GPUFamily
                                )
                            }
                            className="bg-black/60 text-white border border-white/20 rounded px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                            {GPU_FAMILIES.map((fam) => (
                                <option key={fam} value={fam}>
                                    {fam}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-300">
                            GPU string
                        </label>
                        <input
                            type="text"
                            value={emulated_profile.gpu ?? ""}
                            onChange={(e) =>
                                update_custom_field("gpu", e.target.value || null)
                            }
                            placeholder="e.g. ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11...)"
                            className="bg-black/60 text-white border border-white/20 rounded px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                    </div>
                </div>
            )}

            <div className="text-xs bg-black/30 p-2.5 rounded border border-white/10 space-y-1 font-mono text-gray-300">
                <div className="flex justify-between">
                    <span className="text-gray-400">Low power?</span>
                    <span
                        className={
                            live_profile?.low_power
                                ? "text-amber-400"
                                : "text-green-400"
                        }>
                        {live_profile?.low_power ? "Yes" : "No"}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Is standalone?</span>
                    {live_profile?.is_standalone ? "Yes" : "No"}
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">GPU family</span>
                    <span className="text-blue-300">
                        {live_profile?.gpu_family ?? "Unknown"}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">GPU string</span>
                    <span className="text-blue-300">
                        {live_profile?.gpu ?? "Unknown"}
                    </span>
                </div>
            </div>

            (Changes may not take effect everywhere until the engine/game/page is reloaded)
        </div>
    );
};
