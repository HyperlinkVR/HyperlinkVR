import { useGLTF } from "@react-three/drei";
import draco_decoder_url from "three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url";
import draco_wrapper_url from "three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url";
import { configureTextBuilder } from "troika-three-text";

const NOTO_SANS_URL = new URL(
    "../../assets/fonts/NotoSans-Regular.woff",
    import.meta.url
).href;

// DRACOLoader appends fixed filenames to a base path and vite hashes assets, so we hand it a fake base then remap
const DRACO_BASE = "https://bundled-draco.invalid/";

const DRACO_ASSET_BY_NAME: Record<string, string> = {
    "draco_decoder.wasm": draco_decoder_url,
    "draco_wasm_wrapper.js": draco_wrapper_url
};

const real_fetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init) => {
    const url =
        typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

    // draco: serve the bundled decoder instead of gstatic
    if (url.startsWith(DRACO_BASE)) {
        const real_url = DRACO_ASSET_BY_NAME[url.slice(DRACO_BASE.length)];
        if (real_url) return real_fetch(real_url, init);
    }

    // troika unicode fallback: let it hit the cdn, but tag offline failures to prevent crash
    if (url.includes("unicode-font-resolver")) {
        try {
            return await real_fetch(input, init);
        } catch {
            const error = new Error(
                "unicode-font-resolver unavailable (offline)"
            );
            (
                error as Error & { is_font_resolver_failure?: boolean }
            ).is_font_resolver_failure = true;
            throw error;
        }
    }

    return real_fetch(input, init);
};

window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as
        | { is_font_resolver_failure?: boolean }
        | undefined;
    if (reason?.is_font_resolver_failure) {
        event.preventDefault();
    }
});

configureTextBuilder({
    useWorker: false,
    defaultFont: NOTO_SANS_URL
});

// drei's useGLTF has its own DRACOLoader defaulting to gstatic
useGLTF.setDecoderPath(DRACO_BASE);

export const DRACO_DECODER_PATH = DRACO_BASE;
