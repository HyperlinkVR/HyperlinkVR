import "~/shared.css";

import { DevToolsSpyPage } from "@hyperlinkvr/pages/devtools/spy";
import ReactDOM from "react-dom/client";
import { DefaultContextProviders } from "~/contexts/DefaultContextProviders";

const DevToolsSpyUI = () => {
    return (
        <DefaultContextProviders>
            <DevToolsSpyPage />
        </DefaultContextProviders>
    )
};

ReactDOM.createRoot(document.getElementById("root")!).render(
    <DevToolsSpyUI />
);
