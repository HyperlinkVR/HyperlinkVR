import * as component_module from "__COMPONENT_PATH__";
import { render } from "preact";

import "__CSS_PATH__";

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
    let container: HTMLElement | null =
        typeof container_or_selector === "string"
            ? document.querySelector(container_or_selector)
            : container_or_selector || null;

    if (!container) {
        container = document.createElement("div");
        container.id = `${__EXPORT_NAME__}-root`;
        document.body.appendChild(container);
    }

    render(<Component {...options} />, container);
};
