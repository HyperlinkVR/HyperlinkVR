import type { DeviceProfile, GPUFamily } from "@hyperlinkvr/types";
import { get_setting } from "./settings";
import { StorageEngine } from "./storage";
import { getGPUTier } from "@pmndrs/detect-gpu";



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

const detect_profile = async (): Promise<DeviceProfile> => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const is_standalone = STANDALONE_UA_HINTS.some((re) => re.test(ua));

    const gpu = probe_gpu();

    if (gpu) {
        const family = gpu_family(gpu);

        // some devices (especially mobile) hide what gpu they are, so use pmndrs first and foremost, guessing based on family otherwise
        let report;
        try {
            report = await getGPUTier();
        } catch {
            report = null;
        }

        const is_low_tier = report ? report.tier < 3 : is_low_power_family(family);

        if (family === "apple" && report) {
            return {
                low_power: is_low_tier,
                is_standalone,
                gpu: report?.gpu ? `Apple GPU (${report.gpu}?)` : gpu,
                gpu_family: "apple",
                detected_via: "gpu"
            };
        }

        const low_power = is_low_power_family(family);
        return {
            low_power,
            is_standalone,
            gpu,
            gpu_family: family,
            detected_via: "gpu"
        };
    }

    // no GPU string, fall back to sniffing the user agent
    return {
        low_power: is_standalone, // only a guess possible!
        is_standalone,
        gpu: null,
        gpu_family: "unknown",
        detected_via: is_standalone ? "user_agent" : "default"
    };
};

let cached_detected_profile: DeviceProfile | null = null;

export const get_device_profile = async (local_storage: StorageEngine<"local">, bypass_emulation = false): Promise<DeviceProfile> => {
    if (!bypass_emulation) {
        const emulated = await get_setting("devtools_emulated_device_profile", {local: local_storage});
        if (emulated) {
            return emulated;
        }
    }

    if (!cached_detected_profile) {
        cached_detected_profile = await detect_profile();
    }

    return cached_detected_profile;
};
