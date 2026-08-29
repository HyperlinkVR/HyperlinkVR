import * as component_module from "__COMPONENT_PATH__";
import styles from "__CSS_PATH__?inline";
import register from "preact-custom-element";


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

function WebComponentWrapper(props: Record<string, any>) {
    return (
        <>
            <style>{styles}</style>
            <Component {...props} />
        </>
    );
}

register(WebComponentWrapper, __EXPORT_NAME__, [], { shadow: true });
