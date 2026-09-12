import type { Post as PostData } from "@hyperlinkvr/hypergram-schemas/v1";
import { ProfilePicture } from "@hyperlinkvr/ui-dom";
import { useEffect, useMemo, useState } from "react";



import { read_client } from "../api_client";


export const Post = ({ post }: { post: PostData }) => {
    const client = useMemo(() => read_client("http://localhost:8787"), []);
    
    const formatted_date = useMemo(() => new Date(post.ts).toLocaleString(), [post.ts]);
    
    const [profile_picture, setProfilePicture] = useState<string | null>(null);
    useEffect(() => {
        client.get_profile_picture({params: { identity: post.author }}).then((res) => {
            if (res.status === 200) {
                setProfilePicture(res.body.low_res_url);
            }
        });
    }, [client, post.author]);

    return (
        <a href={`/post/${post.id}`} className="w-full">
            <article className="my-5 p-5 bg-gray-700 rounded-lg flex flex-col items-center justify-center gap-5">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                        <ProfilePicture avatar_url={profile_picture || undefined} username={post.author} className="w-10 h-10" />
                        <b>{post.author}</b>
                    </div>

                    <p>{formatted_date}</p>
                </div>

                <img src={post.image_url} alt={post.caption || "Post image"} className="h-150 rounded-lg aspect-square object-cover" />
                {post.caption && <p>{post.caption}</p>}
            </article>
        </a>
    )
}
