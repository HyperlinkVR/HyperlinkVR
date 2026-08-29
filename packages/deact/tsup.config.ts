import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "bin",
    format: ["esm"],
    target: "node18",
    clean: true,
    banner: {
        js: "#!/usr/bin/env node"
    }
});
