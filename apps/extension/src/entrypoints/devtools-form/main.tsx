import { DevToolsFormPage } from "@hyperlinkvr/pages/devtools/form";
import ReactDOM from "react-dom/client";

import { DefaultContextProviders } from "~/contexts/DefaultContextProviders";


export const DevToolsFormUI = () => {
    return (
        <DefaultContextProviders>
            <DevToolsFormPage />
        </DefaultContextProviders>
    )
}

ReactDOM.createRoot(document.getElementById("root")!).render(<DevToolsFormUI />);
