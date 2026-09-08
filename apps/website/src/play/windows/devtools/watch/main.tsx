import "../../../shared.css";

import { DevToolsWatchPage } from "@hyperlinkvr/pages/devtools/watch";
import ReactDOM from "react-dom/client";
import { DefaultContextProviders } from "../../../contexts/DefaultContextProviders";

const DevToolsWatchUI = () => {
    return (
        <DefaultContextProviders>
            <DevToolsWatchPage />
        </DefaultContextProviders>
    )
};

ReactDOM.createRoot(document.getElementById("root")!).render(
    <DevToolsWatchUI />
);
