import "../../shared.css";

import { DevToolsPage } from "@hyperlinkvr/pages/devtools";
import ReactDOM from "react-dom/client";
import { DefaultContextProviders } from "../../contexts/DefaultContextProviders";

const DevToolsUI = () => {
    return (
        <DefaultContextProviders>
            <DevToolsPage />
        </DefaultContextProviders>
    );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<DevToolsUI />);
