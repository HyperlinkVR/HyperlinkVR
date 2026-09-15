type GPUFamily = "adreno" | "mali" | "powervr" | "apple" | "desktop" | "unknown";

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

const STANDALONE_UA_HINTS = [/OculusBrowser/i, /Quest/i, /Pico/i, /Wolvic/i, /VR Browser/i];

const gpu_family = (gpu: string): GPUFamily => {
    const s = gpu.toLowerCase();
    if (s.includes("adreno")) return "adreno";
    if (s.includes("mali")) return "mali";
    if (s.includes("powervr") || s.includes("imagination")) return "powervr";
    // apple silicon (M-series, Vision Pro) is desktop-class, not a low-power tiler
    if (s.includes("apple")) return "apple";
    return "desktop";
};

// adreno/mali/powervr are the mobile SoC GPUs in standalone headsets
const is_low_power_family = (family: GPUFamily) =>
    family === "adreno" || family === "mali" || family === "powervr";

const read_unmasked_renderer = (
    gl: WebGLRenderingContext | WebGL2RenderingContext
): string | null => {
    try {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (!ext) return null;
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        return typeof renderer === "string" && renderer.length > 0 ? renderer : null;
    } catch {
        // some browsers throw rather than returning null when the info is gated
        return null;
    }
};

// spin up a throwaway context purely to read the GPU string, then drop it
const probe_gpu = (): string | null => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const attrs = { xrCompatible: true } as WebGLContextAttributes;
    const gl = (canvas.getContext("webgl2", attrs) ??
        canvas.getContext("webgl", attrs)) as
        | WebGLRenderingContext
        | WebGL2RenderingContext
        | null;
    if (!gl) return null;
    const renderer = read_unmasked_renderer(gl);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return renderer;
};

const detect_profile = (): DeviceProfile => {
    const gpu = probe_gpu();
    if (gpu) {
        const family = gpu_family(gpu);
        const low_power = is_low_power_family(family);
        return {
            low_power,
            tier: low_power ? "standalone" : "pc",
            is_standalone: low_power,
            gpu,
            gpu_family: family,
            detected_via: "gpu"
        };
    }

    // no GPU string, fall back to sniffing the user agent
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const is_standalone = STANDALONE_UA_HINTS.some((re) => re.test(ua));
    return {
        low_power: is_standalone,
        tier: is_standalone ? "standalone" : "unknown",
        is_standalone,
        gpu: null,
        gpu_family: "unknown",
        detected_via: is_standalone ? "user_agent" : "default"
    };
};

let device_profile: DeviceProfile | null = null;

export const get_device_profile = (): DeviceProfile => {
    if (!device_profile) {
        device_profile = detect_profile();
    }
    return device_profile;
};
