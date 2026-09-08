const inject = async () => {
    const sdk = await import("@hyperlinkvr/web-sdk");

    const { _bind_messages, ...sdk_rest } = sdk;

    _bind_messages();

    Object.defineProperty(window, "hyperlinkvr", {
        value: sdk_rest,
        writable: false,
        configurable: false
    });
}

// if sdk is not provided by extension and we are told to inject, then download the sdk (this is needed for non-extension mode)
if (typeof hyperlinkvr === "undefined") {
    const listener = (event: MessageEvent) => {
        if (event.data && event.data.payload && event.data.payload.type === "INJECT_IF_NEEDED") {
            console.log("Injecting SDK fallback");
            window.removeEventListener("message", listener);
            inject();
        }
    }
    window.addEventListener("message", listener);
}
