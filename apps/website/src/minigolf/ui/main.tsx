import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

export const load_app = () => {
    const dom = document.getElementById("root");
    const root = createRoot(dom!);

    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
