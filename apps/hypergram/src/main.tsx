import "./shared.css";

import type { Post as PostData } from "@hyperlinkvr/hypergram-schemas/v1";
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";



import { read_client } from "./api_client";
import { Post } from "./components/Post";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import { Layout } from "./components/Layout";
import { human_status } from "./util/human_status";

const App = () => {
    const client = useMemo(() => read_client(), []);
    
    const [posts, setPosts] = useState<PostData[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        client.get_recent_feed().then((res) => {
            if (res.status === 200) {
                setPosts(res.body.posts);
            } else {
                console.error("Failed to fetch recent feed", res.status, res.body);
                setError(human_status(res.status));
            }

            // TODO: paginate (use component that can also do user feeds when impld
        }).catch((err) => {
            console.error("Error fetching recent feed", err);
            setError("Error while fetching recent feed!");
        });
    }, []);
    
    return (
        <Layout>
            <div className="w-1/2 mx-auto pt-10 flex flex-col items-center flex-1">
                {posts === null && !error && <LoadingSpinner className="my-auto" />}
                {error && <p className="text-red-500 my-auto">{error}</p>}
                {posts !== null && posts.length === 0 && <p className="my-auto opacity-75">crickets...</p>}
                {posts && posts.map((post) => (
                    <Post snippet post={post} key={post.id} />
                ))}
            </div>
        </Layout>
    );
}

ReactDOM.createRoot(document.querySelector("#root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
