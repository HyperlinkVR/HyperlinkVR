import { useStorage } from "@hyperlinkvr/react";
import { Menu, Settings, Star, Terminal } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";



import { backend_integration } from "../backend";
import { SquareButton } from "./SquareButton";


interface NavigationBarProps {
    initial_url?: string;
    on_url_submit: (url: string) => void;
}

const WorldsMenu = ({on_choose}: {on_choose: (url: string) => void}) => {
    const [favourite_worlds] = useStorage("sync", "favourite_worlds", [] as string[]);

    return (
        <div className="relative w-full">
            <div className="absolute w-full top-0 left-0 flex flex-col bg-gray-700 text-white p-2 rounded-b-xl shadow-lg">
                {favourite_worlds.length === 0 ? (
                    <div className="text-center text-gray-400">No favourite worlds</div>
                ) : (
                    <>
                        <span className="text-sm opacity-75">Favourite worlds</span>
                        {favourite_worlds.map((url) => (
                            <button key={url} className="flex items-center justify-between p-2 hover:bg-gray-600 rounded cursor-pointer" onClick={() => on_choose(url)}>
                                {url}
                            </button>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

export const NavigationBar = ({initial_url = "", on_url_submit}: NavigationBarProps) => {
    const [input_url, setInputURL] = useState(initial_url);
    const [committed_url, setCommittedURL] = useState(initial_url);

    // TODO: generation key to reload on renav

    const commit_url = useCallback(
        (url: string) => {
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "https://" + url;
                setInputURL(url);
            }

            setCommittedURL(url);
            on_url_submit(url);
        },
        [on_url_submit]
    );

    const [favourite_worlds, setFavouriteWorlds] = useStorage("sync", "favourite_worlds", [] as string[]);
    const is_world_favourite = useMemo(() => {
        if (!committed_url) return false;
        return favourite_worlds.includes(committed_url);
    }, [favourite_worlds, committed_url]);

    const toggle_favourite = useCallback(
        () => {
            if (!committed_url) return;
            if (is_world_favourite) {
                setFavouriteWorlds(favourite_worlds.filter(fav_url => fav_url !== committed_url));
            } else {
                setFavouriteWorlds([...favourite_worlds, committed_url]);
            }
            },
        [committed_url, favourite_worlds, is_world_favourite, setFavouriteWorlds]
    );

    const [menu_open, setMenuOpen] = useState(false);

    const on_world_chosen = useCallback(
        (url: string) => {
            setInputURL(url);
            commit_url(url);
            setMenuOpen(false);
        },
        [commit_url]
    );

    return (
        <>
            <div className="flex items-center justify-stretch">
                <SquareButton label={<Menu />} title="Open worlds menu" on_click={() => setMenuOpen((prev) => !prev)} className="h-full bg-gray-600" />

                <input className={`flex-1 mx-2 ${committed_url !== input_url ? "opacity-60" : ""}`} type="url" value={input_url} onChange={(e) => setInputURL(e.target.value)} onKeyUp={(e) => e.key === "Enter" && commit_url(input_url)} />
                <button className="bg-blue-500 text-white px-5 py-1 cursor-pointer" onClick={() => commit_url(input_url)}>Go</button>

                <SquareButton label={<Star fill={is_world_favourite ? "white" : "none"} />} title={is_world_favourite ? "Unfavourite" : "Favourite"} on_click={toggle_favourite} className="h-full bg-yellow-500" />

                <SquareButton label={<Settings />} title="Open settings" on_click={() => backend_integration.create_window({intent: "SETTINGS"}, false)} className="h-full bg-emerald-600" />
                <SquareButton label={<Terminal />} title="Open devtools" on_click={() => backend_integration.create_window({intent: "DEVTOOLS"}, false)} className="h-full bg-gray-600" />
            </div>

            {menu_open && <WorldsMenu on_choose={on_world_chosen} />}
        </>
    );
}

// TODO: allow shortcodes?
