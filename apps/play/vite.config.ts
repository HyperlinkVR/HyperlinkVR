import { execSync } from "node:child_process";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { VitePWA } from "vite-plugin-pwa";

// TODO: make this some package that both vite pipelines can use rather than duplication
const INCLUDE_IWER = process.env.USE_IWER === "true" || process.env.USE_IWER === "1";
const ENVIRONMENT = process.env.NODE_ENV || "development";

if (INCLUDE_IWER && ENVIRONMENT === "production") {
    throw new Error("Not allowed to pass INCLUDE_IWER=1 in production builds");
}

const aliases: Record<string, string> = {};

if (!INCLUDE_IWER) {
    aliases["iwer"] = resolve("./src/shims/iwer.ts");
    aliases["@iwer/sem"] = resolve("./src/shims/iwer-sem.ts");
    aliases["@iwer/devui"] = resolve("./src/shims/iwer-devui.ts");
    aliases["@pmndrs/xr/emulate"] = resolve("./src/shims/pmndrs-xr-emulate.ts");

    console.log("Shimmed out IWER modules");
}

const source_root = resolve(import.meta.dirname, "src");

const page = (...segments: string[]) => resolve(source_root, ...segments);

let commit_hash: string;
try {
    commit_hash = execSync("git rev-parse --short HEAD").toString().trim();
} catch (e) {
    commit_hash = "unknown commit";
}

export default defineConfig({
    root: source_root,
    appType: "mpa",

    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: "prompt",

            manifest: {
                name: "HyperlinkVR",
                short_name: "HyperlinkVR",
                description: "",
            },

            workbox: {
                // precache built engine core
                globPatterns: ["**/*"],
                maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,

                navigateFallback: null,

                // cache any external cdn assets engine libraries may end up loading
                runtimeCaching: [
                    {
                        urlPattern: ({ request }) => {
                            return request.method === "GET" && request.destination !== "document";
                        },
                        handler: "CacheFirst",
                        options: {
                            cacheName: "engine-external",
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                                purgeOnQuotaError: true,
                            },
                            cacheableResponse: {
                                statuses: [0, 200], // caches standard (200) and cross-origin opaque (0) assets
                            },
                        },
                    },
                ],
                // TODO: inject light service worker into sdk so iframed worlds are downloaded for offline use (either automatically or via prompt)
            }
        })
    ],

    server: {
        port: 5176,
        host: true
    },

    define: {
        __COMMIT_HASH__: JSON.stringify(commit_hash)
    },

    resolve: {
        alias: aliases,
    },

    build: {
        outDir: resolve(import.meta.dirname, "dist"),
        emptyOutDir: true,
        rolldownOptions: {
            input: {
                home: page("index.html"),

                vr_host: page("windows", "vr_host", "index.html"),
                settings: page("windows", "settings", "index.html"),
                devtools: page("windows", "devtools", "index.html"),
                devtools_form: page("windows", "devtools", "form", "index.html"),
                devtools_spy: page("windows", "devtools", "spy", "index.html"),
                devtools_watch: page("windows", "devtools", "watch", "index.html")
            }
        }
    }
});
