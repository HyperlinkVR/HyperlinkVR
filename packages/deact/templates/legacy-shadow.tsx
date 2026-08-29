import * as component_module from "__COMPONENT_PATH__";
import styles from "__CSS_PATH__?inline";
import { render } from "preact";
import { hoist_font_rules } from "./hoist-fonts";

// accept a default export or a single named function export, so authors can pick whichever style they like without the cli needing to know the name
const exports = component_module as Record<string, unknown>;
const candidates =
    typeof exports.default === "function"
        ? [exports.default]
        : Object.values(exports).filter((v) => typeof v === "function");

if (candidates.length !== 1) {
    throw new Error(
        `deact: expected exactly one component export in the entry file, found ${candidates.length}.`
    );
}

const Component = candidates[0] as (props: Record<string, any>) => any;

declare global {
    interface Window {
        [key: string]: any;
    }
}

window[`init_${__EXPORT_NAME__}`] = function (
    options: Record<string, any> = {},
    container_or_selector?: HTMLElement | string
) {
    let host: HTMLElement | null =
        typeof container_or_selector === "string"
            ? document.querySelector(container_or_selector)
            : container_or_selector || null;

    if (!host) {
        host = document.createElement("div");
        host.id = `${__EXPORT_NAME__}-host`;
        document.body.appendChild(host);
    }

    const shadow_root = host.shadowRoot || host.attachShadow({ mode: "open" });
    let mount = shadow_root.querySelector("#root") as HTMLElement | null;

    if (!mount) {
        mount = document.createElement("div");
        mount.id = "root";

        const style_tag = document.createElement("style");
        // register font faces on the document; keep the rest in the shadow root
        style_tag.textContent = hoist_font_rules(styles);
        shadow_root.appendChild(style_tag);
        shadow_root.appendChild(mount);
    }

    render(<Component {...options} />, mount);
};
