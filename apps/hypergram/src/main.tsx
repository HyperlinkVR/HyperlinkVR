import "./shared.css";

import type { Post as PostData } from "@hyperlinkvr/hypergram-schemas/v1";
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";



import { read_client } from "./api_client";
import { Header } from "./components/Header";
import { Post } from "./components/Post";


const App = () => {
    const client = useMemo(() => read_client("http://localhost:8787"), []);
    
    const [posts, setPosts] = useState<PostData[]>([]);

    useEffect(() => {
        client.get_recent_feed().then((res) => {
            if (res.status === 200) {
                setPosts(res.body.posts);
            }
        });
    }, []);
    
    return (
        <main className="p-5 bg-gray-800 min-h-screen text-white">
            <Header />

            <div className="w-1/2 mx-auto pt-10">
                {posts.map((post) => (
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
