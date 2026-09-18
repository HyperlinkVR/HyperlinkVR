import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite"

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

    plugins: [react(), tailwindcss()],

    server: {
        port: 5176,
        host: true
    },

    define: {
        __COMMIT_HASH__: JSON.stringify(commit_hash)
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
