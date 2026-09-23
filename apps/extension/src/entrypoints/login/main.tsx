import { LoginPage } from "@hyperlinkvr/pages/login";
import ReactDOM from "react-dom/client";
import { DefaultContextProviders } from "../../contexts/DefaultContextProviders";

const LoginUI = () => {
    return (
        <DefaultContextProviders>
            <LoginPage />
        </DefaultContextProviders>
    );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<LoginUI />);
