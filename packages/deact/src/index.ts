import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { Command } from "commander";
import { build } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const program = new Command();

// commander outputs kebab case to camel case
interface CLIOptions {
    type: "web-component" | "legacy-dom";
    shadow: string;
    outDir: string;
    name?: string;
    cssPathOverride?: string;
}

program
    .name("deact")
    .description(
        "Compile React components into lightweight CDN scripts using Preact and Vite"
    )
    .version("0.0.1");

program
    .argument("<inputs...>", "File path(s) to the component(s)")
    .option(
        "-t, --type <target>",
        'Output type: "web-component" or "legacy-dom"',
        "web-component"
    )
    .option(
        "-s, --shadow <boolean>",
        "Enable Shadow DOM for legacy-dom target",
        "true"
    )
    .option(
        "-o, --out-dir <dir>",
        "Directory to save output script(s)",
        "./dist"
    )
    .option("-n, --name <name>", "Custom global function or tag name")
    .option(
        "-c, --css-path-override <path>",
        "Override the default CSS file used for the component (defaults to basic Tailwind injection)"
    );

program.parse(process.argv);

// import resolution from the cli context, not the working dir
const require = createRequire(import.meta.url);

const process_component = async (
    file_path: string,
    options: CLIOptions
): Promise<void> => {
    if (!fs.existsSync(file_path)) {
        console.error(`File not found "${file_path}"`);
        return;
    }

    const parsed = path.parse(file_path);
    const component_name = parsed.name;
    const export_name =
        options.name || format_export_name(component_name, options.type);

    const css_path = options.cssPathOverride
        ? path.resolve(process.cwd(), options.cssPathOverride)
        : path.resolve(__dirname, "../src/styles.css");
    const use_shadow = options.shadow === "true";

    const template = select_template(options.type, use_shadow);
    const entry_path = path.resolve(__dirname, `../templates/${template}`);

    console.log(
        `\n📦 Building: ${parsed.base} -> ${export_name}.js (${options.type})`
    );

    try {
        // resolve react + the jsx runtime to absolute paths from the cli's own
        // node_modules. the preset otherwise injects bare "preact/compat" /
        // "preact/jsx-runtime" aliases that get resolved relative to the
        // component being built (e.g. in ui-dom), where preact isn't installed
        // under pnpm. keys are ordered specific -> general because vite string
        // aliases prefix-match ("react" also matches "react/jsx-runtime"), and
        // we only touch specifiers that originate from the component itself -
        // preact's own internal imports resolve fine from the pnpm store.
        const compat = require.resolve("preact/compat");
        const jsx_runtime = require.resolve("preact/jsx-runtime");

        await build({
            configFile: false,
            plugins: [
                preact({ reactAliasesEnabled: false }),
                tailwindcss(),
                cssInjectedByJsPlugin()
            ],
            resolve: {
                // array form so the placeholders can be anchored regexes
                // the css imports with a "?inline" query, which vite's string aliases won't match
                alias: [
                    { find: "react/jsx-runtime", replacement: jsx_runtime },
                    { find: "preact/jsx-runtime", replacement: jsx_runtime },
                    { find: /^react-dom$/, replacement: compat },
                    { find: /^react$/, replacement: compat },
                    { find: /^__COMPONENT_PATH__$/, replacement: file_path },
                    { find: /^__CSS_PATH__/, replacement: css_path }
                ]
            },
            define: {
                __EXPORT_NAME__: JSON.stringify(export_name),
                // some scripts use import.meta.url, but vite resolves import.meta to {}, so replace it
                "import.meta.url": "document.currentScript?.src"
            },
            build: {
                assetsInlineLimit: () => true,
                lib: {
                    entry: entry_path,
                    name: export_name.replace(/-/g, "_"),
                    fileName: () => `${export_name}.js`,
                    formats: ["iife"]
                },
                outDir: path.resolve(process.cwd(), options.outDir),
                emptyOutDir: false
            },
            logLevel: "error"
        });

        console.log(`Finished: ${options.outDir}/${export_name}.js`);
    } catch (err) {
        console.error(`Build failed for ${parsed.base}:`, err);
    }
}

const select_template = (
    target_type: "web-component" | "legacy-dom",
    use_shadow: boolean
): string => {
    if (target_type === "web-component") {
        return "web-component.tsx";
    }
    return use_shadow ? "legacy-shadow.tsx" : "legacy-light.tsx";
}

const format_export_name = (filename: string, target_type: string): string => {
    if (target_type === "web-component") {
        const kebab = filename
            .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
            .toLowerCase();
        return kebab.includes("-") ? kebab : `widget-${kebab}`;
    }
    return filename;
}

const main = async () => {
    const options = program.opts<CLIOptions>();
    const inputs = program.args;

    if (inputs.length === 0) {
        console.error("No input files provided.");
        process.exit(1);
    }

    for (const input of inputs) {
        await process_component(input, options);
    }
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
