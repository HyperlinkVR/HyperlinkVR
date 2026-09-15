export type GPUFamily =
    | "adreno"
    | "mali"
    | "powervr"
    | "apple"
    | "desktop"
    | "unknown";

export interface DeviceProfile {
    low_power: boolean;
    tier: "standalone" | "pc" | "unknown";

    // best guess if this is a standalone headset, often correlated with low_power (but not always, e.g. higher pwoer standalones like AVP). this is a hint from the user agent
    is_standalone: boolean;

    // full gpu identitfier once known
    gpu: string | null;
    gpu_family: GPUFamily;

    detected_via: "gpu" | "user_agent" | "default";
}
