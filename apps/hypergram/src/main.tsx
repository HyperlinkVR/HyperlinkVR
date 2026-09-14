import "./shared.css";

import type { Post as PostData } from "@hyperlinkvr/hypergram-schemas/v1";
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";



import { read_client } from "./api_client";
import { Header } from "./components/Header";
import { Post } from "./components/Post";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";


const App = () => {
    const client = useMemo(() => read_client(), []);
    
    const [posts, setPosts] = useState<PostData[] | null>(null);

    useEffect(() => {
        client.get_recent_feed().then((res) => {
            if (res.status === 200) {
                setPosts(res.body.posts);
            }
            // TODO: paginate (use component that can also do user feeds when impld
        });
    }, []);
    
    return (
        <main className="p-5 bg-gray-800 min-h-screen text-white flex flex-col">
            <Header />

            <div className="w-1/2 mx-auto pt-10 flex flex-col items-center flex-1">
                {posts === null && <LoadingSpinner className="my-auto" />}
                {posts !== null && posts.length === 0 && <p className="my-auto opacity-75">crickets...</p>}
                {posts && posts.map((post) => (
                    <Post snippet post={post} key={post.id} />
                ))}
            </div>
        </main>
    );
}

ReactDOM.createRoot(document.querySelector("#root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
