import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "wxt";



import pkg from "./package.json" with { type: "json" };


// TODO: postcss plugin still used for mantine. seems to work but it shouldnt. might be build cache

const INCLUDE_IWER = process.env.USE_IWER === "true" || process.env.USE_IWER === "1";
const ENVIRONMENT = process.env.NODE_ENV || "development";

if (INCLUDE_IWER && ENVIRONMENT === "production") {
    throw new Error("Not allowed to pass INCLUDE_IWER=1 in production builds");
}

const aliases: Record<string, string> = {}

if (!INCLUDE_IWER) {
    aliases["iwer"] =  "./src/shims/iwer.ts";
    aliases["@iwer/sem"] = "./src/shims/iwer-sem.ts";
    aliases["@iwer/devui"] = "./src/shims/iwer-devui.ts";
    aliases["@pmndrs/xr/emulate"] = "./src/shims/pmndrs-xr-emulate.ts";

    console.log("Shimmed out IWER modules");
}

const force_prebundle = [
    "@hyperlinkvr/vr-engine > @react-three/xr",
    "@hyperlinkvr/vr-engine > @react-three/xr > @pmndrs/xr",
    "@hyperlinkvr/vr-engine > @react-three/xr > @pmndrs/xr > @pmndrs/msdfonts",
    "@hyperlinkvr/vr-engine > @react-three/fiber",
    "@hyperlinkvr/vr-engine > @react-three/drei",
    "@hyperlinkvr/vr-engine > @react-three/uikit",
    "@hyperlinkvr/vr-engine > @react-three/uikit-default",
    "@hyperlinkvr/watch-ui > @react-three/uikit",
    "@hyperlinkvr/watch-ui > @react-three/uikit-default",
    "@hyperlinkvr/vr-engine > troika-three-text",
    "@hyperlinkvr/vr-engine > three"
];

const LOG_COMPILATION = process.env.LOG_COMPILATION === "true" || process.env.LOG_COMPILATION === "1";

// dev extension ID: fjmemngcdmokahnlanbkljldfmnhagbf
const DEV_PUBKEY = "MD8BIjANCgYJKj9IPz8NCgEBAQUAAz8BDwAwPwENCgI/AQEAP2ZIP295Pz8/PwdEPz8Wdz8/PzQ/bnc/MD8/KD8TPz9PWD9pP28/aSQNCj8/Pz9pPz8yPz8/Pwx6JXw/KT8/Pz8/KEstaTUnFj8oP0c/GEQAPw0KPz8/QBM/XjIBPyM/e29GUUpBPz8/P38/P115YSoJZgU/M3cgP312dRE/Pz9mPz8/Dj8TPz8/P38uUz8/Uj8/aj8/JD8/TjYPPz8RZRwWcj8qP0I/P1NcUT8/Pyc5Pz9DJj8/a18/JFtbEz8xWD98MEE/Pz9CP2IZYz90Pz9TEj9UVxJPPz8/Pz8/Pz8/Pz8NCj9lP1ljeB5QGncSPz8/Pyw/Pz8yMj53WVB0PwY/PwIDAQABDQo=";

// prod extension ID: dpiedhlnbehmphhiihhgibaodpbhdbln
const PROD_PUBKEY =
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiLLiapetqs49GqoOHlBQ" +
    "Tc7AyemSb98BCBZ2nqjkeWSqVn0uxAnNlHjrGSuBIqe8mVn7jKtPtszyDWe2oG3J" +
    "M+wx56ReF/H0LYZbtxC+tfbGveDvIb516Wl7GGQBrFapk+ynKUvYDpo4msloyLby" +
    "Ty4Iw44ZaLzAEQsk7rFacGJZwEi700fVEkSlfhUW4+EzjQfZvLFDvHsyDnRCoRfA" +
    "My+s/byaqY14Zme4TzXqgwLYB+NBbz4MLzlW4iJX8uObz9+U5wHxw9O7B6tN367U" +
    "wqHFxGHnPNTWZtbWCvc5ZVFPQUU9vMM2vPCzrLgt92oTk5cBnKhivvenR7Pd/T9m" +
    "aQIDAQAB";

export default defineConfig({
    vite: () => ({
        build: {
            minify: "terser",
            terserOptions: {
                keep_classnames: /Container|Text|Image|Svg|Video|Icon|Content|Root|Fullscreen|Component|Portal/,
                keep_fnames: /Container|Text|Image|Svg|Video|Icon|Content|Root|Fullscreen|Component|Portal/
            }
        },
        plugins: [
            tailwindcss(),
            LOG_COMPILATION
                ? {
                      name: "comp-log",
                      enforce: "pre",
                      transform(code, id) {
                          if (
                              !id.includes("?vue") &&
                              !id.includes(".css") &&
                              !id.includes("\x00")
                          ) {
                              console.log(`[Compiling] ${id}`);
                          }
                          return null;
                      }
                  }
                : undefined,
            {
                name: "no-tsbuildinfo",
                enforce: "post",
                generateBundle(_, bundle) {
                    for (const file of Object.keys(bundle)) {
                        if (file.endsWith(".tsbuildinfo")) {
                            delete bundle[file];
                        }
                    }
                }
            },
            visualizer((outputOptions) => {
                const build_name = outputOptions.name
                    ? outputOptions.name
                          .replace(/[^a-z0-9]/gi, "-")
                          .toLowerCase()
                    : "extension";

                return {
                    filename: `stats/${build_name}.html`,
                    open: false
                };
            })
        ],
        assetsInclude: ["**/*.wasm"],
        optimizeDeps: {
            include: force_prebundle,
            exclude: ["argon2-browser"]
        }
    }),

    srcDir: "src",
    imports: {
        // @ts-ignore stop importing their slop into packages without my consent
        disabled: true,
        exclude: [/packages\//]
    },

    manifest: {
        name: "HyperlinkVR",
        version: pkg.version,
        description: pkg.description,
        homepage_url: pkg.homepage,
        host_permissions: ["https://*/*"],
        permissions: [
            "contextMenus",
            "tabCapture",
            "activeTab",
            //"debugger", TODO: implement debug input sidecar
            "storage"
        ],
        // for discord rpc
        optional_permissions: [
            "nativeMessaging"
        ],
        content_security_policy: {
            extension_pages:
                `script-src 'self'${ENVIRONMENT === "production" ? "" : " http://localhost:8097"} 'wasm-unsafe-eval'; object-src 'self';`
        },
        key: ENVIRONMENT === "production" ? PROD_PUBKEY : DEV_PUBKEY,
        browser_specific_settings: {
            gecko: {
                id: ENVIRONMENT === "production" ? "@hyperlinkvr/extension" : "@hyperlinkvr/extension(dev)",
            }
        }
    },

    alias: aliases,

    modules: ["@wxt-dev/auto-icons"],

    //@ts-ignore
    autoIcons: {
        baseIconPath: "../../../packages/assets/hyperlinkvr_no_vars.svg",
        sizes: [16, 32, 48, 96, 128],
        developmentIndicator: "overlay"
    },

    webExt: {
        disabled: true
    },

    hooks: {
        "prepare:tsconfig": (wxt, { tsconfig }) => {
            tsconfig.compilerOptions.verbatimModuleSyntax = false;
        },
    },
});
