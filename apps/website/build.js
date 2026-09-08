import { build, createServer } from "vite";

const is_dev = process.argv.includes("--dev");

const cdn_config = {
    configFile: false,
    publicDir: false,
    build: {
        watch: is_dev ? {} : undefined,
        outDir: "public/cdn",
        emptyOutDir: true,
        rollupOptions: {
            input: "./src/sdk_fallback.ts",
            output: {
                entryFileNames: "sdk_fallback.js"
            }
        }
    }
};

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
        await build(cdn_config);
    } else {
        // build web
        await build();

        // build cdn
        await build(cdn_config);
    }
}

run();
