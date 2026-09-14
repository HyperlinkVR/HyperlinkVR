import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import { useEffect, useState } from "react";



import { auth_client, read_client } from "../api_client";


export const Header = () => {
    const logged_in = localStorage.getItem("token") !== null;

    const [auth_loading, setAuthLoading] = useState(true);
    const [login_supported, setLoginSupported] = useState(false);

    useEffect(() => {
        const client = read_client();

        client.get_manifest().then(res => {
            if (res.status !== 200) {
                console.error("Failed to fetch manifest");
                setLoginSupported(false);
                setAuthLoading(false);
                return;
            }

            const auth = res.body.auth;
            setLoginSupported(auth && auth.login && auth.web);
            setAuthLoading(false);
        });
    }, []);

    const handle_login = async () => {
        setAuthLoading(true);

        const client = auth_client();

        const redirect_uri = new URL("/callback", window.location.origin);
        redirect_uri.searchParams.set("redirect", window.location.pathname + window.location.search);
        console.log("Redirect URI:", redirect_uri.toString());

        const response = await client.login_web({
            body: {
                redirect_uri: redirect_uri.toString()
            }
        });

        if (response.status === 200) {
            window.location.href = response.body.auth_url;
        } else {
            console.error("Failed to get auth URL", response.status, response.body);
            alert("Failed to get auth URL. Please try again later.");
            setAuthLoading(false);
        }
    }

    // TODO: show own profile pic (prob best to move login/out button to component)
    return (
        <header className="fixed top-0 left-0 py-4 pl-5 pr-10 flex items-center justify-between w-full">
            <a href="/">
                <h1 className="text-3xl font-title">
                    Hypergram
                </h1>
            </a>

            {auth_loading && <LoadingSpinner />}
            {!auth_loading && login_supported && (logged_in ? (
                <button className="text-blue-200 hover:underline cursor-pointer">
                    Logout from {localStorage.getItem("username")}
                </button>
            ) : (
                <button onClick={handle_login} className="text-blue-200 hover:underline cursor-pointer">
                    Login
                </button>
            ))}
        </header>
    )
}
