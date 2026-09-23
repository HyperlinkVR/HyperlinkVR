import "../shared.css";

import type { Post as PostData } from "@hyperlinkvr/hypergram-schemas/v1";
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";



import { read_client } from "../api_client";
import { Post } from "../components/Post";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import { Layout } from "../components/Layout";
import { human_status } from "../util/human_status";


const App = () => {
    const client = useMemo(() => read_client(), []);
    
    const [post, setPost] = useState<PostData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id");
        if (!id) {
            setError("Missing post ID");
            return;
        }

        client.get_post({ params: { id } }).then((res) => {
            if (res.status === 200) {
                setPost(res.body);
            } else {
                console.error("Failed to fetch post", res.status, res.body);
                setError(human_status(res.status));
            }
        }).catch((err) => {
            console.error("Error fetching post", err);
            setError("Error while fetching post!");
        });
    }, []);

    
    return (
        <Layout className="items-stretch justify-start gap-5">
            <div className="w-4/5 mx-auto flex flex-col items-stretch justify-center flex-1">
                {error && <p className="text-red-500">{error}</p>}
                {post && <Post post={post} />}
                {!post && !error && <LoadingSpinner className="mx-auto" />}
            </div>
        </Layout>
    );
}

ReactDOM.createRoot(document.querySelector("#root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
