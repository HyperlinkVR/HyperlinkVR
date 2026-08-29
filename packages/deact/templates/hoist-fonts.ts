// @font-face and font @import rules are ignored inside a shadow root
// pull those rules out, register them once on the document, and return the remaining css
const FONT_RULES = /@font-face\s*\{[^}]*\}|@import\s+[^;]+;/gi;

export function hoist_font_rules(css: string): string {
    if (typeof document === "undefined") return css;

    const rules = css.match(FONT_RULES);
    if (!rules) return css;

    const block = rules.join("\n");

    // dedupe across instances / repeated mounts by keying on the content
    const id = `deact-fonts-${hash(block)}`;
    if (!document.getElementById(id)) {
        const style = document.createElement("style");
        style.id = id;
        style.textContent = block;
        document.head.appendChild(style);
    }

    return css.replace(FONT_RULES, "");
}

function hash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
