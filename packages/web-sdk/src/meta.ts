import { notify_via_messaging } from "./messenger";

const META_SELECTOR = "meta[name=\"hyperlinkvr\"]";

// - supported (tells the host to show a loading screen until connecting)
// - defer (tells the host to display the fallback dom mirror as usual but listen for connections still) (the default)
// - disable, which tells the host to not inject the sdk at all and just let the page run as normal via dom mirror
export type SupportMeta = "supported" | "defer" | "disable";

export const read_meta = (): SupportMeta => {
    const content = document.querySelector(META_SELECTOR)?.getAttribute("content");

    return content === "supported" || content === "disable" ? content : "defer";
};

export const report_meta = () => {
    const send = () => notify_via_messaging({ action: "HVRSDK_META", content: read_meta() });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", send, { once: true });
        return;
    }

    // installed late (a page added the script itself), so the document is already there to read
    send();
};
