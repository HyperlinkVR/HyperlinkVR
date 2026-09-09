import { build, createServer } from "vite";





const is_dev = process.argv.includes("--dev");

const make_cdn_config = (entry, file_name, is_first) => ({
    configFile: false,
    publicDir: false,
    define: {
        "import.meta.url": "document.currentScript?.src"
    },
    build: {
        target: "es2020",
        watch: is_dev ? {} : undefined,
        outDir: "public/cdn",
        emptyOutDir: is_first,
        rollupOptions: {
            input: entry,
            output: {
                format: "iife",
                entryFileNames: file_name
            }
        }
    }
});

// fallback loader for non ext context
const loader_config = make_cdn_config(
    "./src/cdn/sdk_fallback.ts",
    "sdk_fallback.js",
    true
);

// the actual sdk, pulled by the fallback loader only in host mode
const sdk_config = make_cdn_config(
    "./src/cdn/sdk.ts",
    "sdk.js",
    false
);

const run = async () => {
    if (is_dev) {
        // web build watched
        const server = await createServer({
            configFile: "vite.config.ts",
            server: { port: 5175 }
        });

        await server.listen();
        server.printUrls();

        // cdn build watched
        await build(loader_config);
        await build(sdk_config);
    } else {
        // build web
        await build();

        // build cdn
        await build(loader_config);
        await build(sdk_config);
    }
}

run();
