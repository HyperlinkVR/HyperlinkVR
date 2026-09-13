import type { Post as PostData } from "@hyperlinkvr/hypergram-schemas/v1";
import { ProfilePicture } from "@hyperlinkvr/ui-dom";
import { useCallback, useEffect, useMemo, useState } from "react";



import { read_client, write_client } from "../api_client";
import { Pencil, Trash } from "lucide-react";

const PostEditControls = ({ post }: { post: PostData }) => {
    const edit_post = useCallback(
        async (e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();

            // TODO: proper modal
            const new_caption = prompt("Enter new caption", post.caption || "");
            if (new_caption === null) return;

            const client = write_client();
            const res = await client.edit_post({
                params: { id: post.id },
                body: { caption: new_caption}
            });

            if (res.status === 200) {
                // TODO: update post in place instead of reloading
                window.location.reload();
            } else {
                console.error("Failed to edit post", res.status, res.body);
                alert("Failed to edit post");
            }
        },
        [post.id, post.caption]
    );

    const delete_post = useCallback(
        async (e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();

            if (!confirm("Are you sure you want to delete this post?")) return;

            const client = write_client();
            const res = await client.delete_post({ params: { id: post.id } });

            if (res.status === 200) {
                // TODO: delete post in place instead of reloading
                // TODO: this is also context dependent of whether it was on a feed or not
                window.location.href = "/";
            } else {
                console.error("Failed to delete post", res.status, res.body);
                alert("Failed to delete post");
            }
        },
        [post.id]
    );

    return (
        <div className="flex items-center gap-3">
            <button onClick={edit_post} className="px-2 py-1 text-blue-400 cursor-pointer" title="Edit post">
                <Pencil />
            </button>

            <button onClick={delete_post} className="px-2 py-1 text-red-400 cursor-pointer" title="Delete post">
                <Trash />
            </button>
        </div>
    )
}

const PostInternal = ({ post, snippet = false }: { post: PostData, snippet?: boolean }) => {
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

    const my_post = useMemo(() => post.author === localStorage.getItem("username"), [post.author]);

    return (
        <article className="my-5 p-5 bg-gray-700 rounded-lg flex flex-col items-center justify-center gap-5">
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                    <ProfilePicture avatar_url={profile_picture || undefined} username={post.author} className="w-10 h-10" />
                    <b>{post.author}</b>
                </div>

                <div className="flex items-center gap-3">
                    <p>{formatted_date}</p>
                    {my_post && <PostEditControls post={post} />}
                </div>
            </div>

            <img src={post.image_url} alt={post.caption || "Post image"} className={`h-150 rounded-lg object-cover ${snippet ? "aspect-square" : ""}`} />
            {post.caption && (
                <p className="w-full">
                    <span className="font-bold">{post.author}: </span>
                    {post.caption}
                </p>
            )}
        </article>
    )
}

export const Post = ({ post, snippet = false }: { post: PostData, snippet?: boolean }) => {
    if (snippet) {
        return (
            <a href={`/post/?id=${post.id}`} className="w-full">
                <PostInternal post={post} snippet={snippet} />
            </a>
        )
    } else {
        return <PostInternal post={post} snippet={snippet} />
    }
}
