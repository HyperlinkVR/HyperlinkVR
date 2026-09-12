import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";

import { read_client } from "./api_client";

const App = () => {
    return "hi";
}

ReactDOM.createRoot(document.querySelector("#root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
