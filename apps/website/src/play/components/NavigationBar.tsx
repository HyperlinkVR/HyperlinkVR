import { Settings, Terminal } from "lucide-react";
import React, { useState } from "react";



import { backend_integration } from "../backend";


interface NavigationBarProps {
    initial_url?: string;
    commit_url: (url: string) => void;
}

const SquareButton = ({label, title, className = "", on_click}: {label: React.ReactNode; title?: string; className?: string; on_click: () => void}) => {
    return (
        <button onClick={on_click} title={title} className={`${className} text-white aspect-square h-full cursor-pointer flex items-center justify-center`}>
            {label}
        </button>
    );
}

export const NavigationBar = ({initial_url = "", commit_url}: NavigationBarProps) => {
    const [input_url, setInputURL] = useState(initial_url);

    return (
        <div className="flex items-center justify-stretch">
            <input className="flex-1 mx-2" type="url" value={input_url} onChange={(e) => setInputURL(e.target.value)} />
            <button className="bg-blue-500 text-white px-5 py-1 cursor-pointer" onClick={() => commit_url(input_url)}>Go</button>
            <SquareButton label={<Settings />} title="Open settings" on_click={() => backend_integration.create_window({intent: "SETTINGS", width: 900, height: 500})} className="bg-emerald-600" />
            <SquareButton label={<Terminal />} title="Open devtools" on_click={() => backend_integration.create_window({intent: "DEVTOOLS", width: 900, height: 500})} className="bg-gray-600" />
        </div>
    );
}
