import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite"

const source_root = resolve(import.meta.dirname, "src");
const static_root = resolve(import.meta.dirname, "public");

const page = (...segments: string[]) => resolve(source_root, ...segments);

const redirect_to_directory_slash = (served_roots: string[]): Plugin => ({
    name: "redirect-to-directory-slash",
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            const [pathname, query] = (req.url ?? "").split("?");

            // already slashed, or a real file request
            if (!pathname || pathname.endsWith("/") || /\.[^/]+$/.test(pathname)) {
                next();
                return;
            }

            const relative_path = `.${decodeURIComponent(pathname)}`;

            const has_directory_index = served_roots.some((served_root) => {
                const candidate = resolve(served_root, relative_path);
                const inside_root = candidate === served_root || candidate.startsWith(join(served_root, sep));

                return inside_root && existsSync(join(candidate, "index.html"));
            });

            if (!has_directory_index) {
                next();
                return;
            }

            res.statusCode = 301;
            res.setHeader("Location", `${pathname}/${query ? `?${query}` : ""}`);
            res.end();
        });
    }
});

export default defineConfig({
    root: source_root,
    publicDir: static_root,
    appType: "mpa",

    plugins: [redirect_to_directory_slash([source_root, static_root]), react(), tailwindcss()],

    server: {
        port: 5175,
        host: true
    },

    build: {
        outDir: resolve(import.meta.dirname, "dist"),
        emptyOutDir: true,
        rolldownOptions: {
            input: {
                home: page("index.html"),
                clubhouse: page("clubhouse", "index.html"),
                minigolf: page("minigolf", "index.html")
            }
        }
    }
});