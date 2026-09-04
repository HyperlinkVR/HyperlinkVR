import "@hyperlinkvr/styles/shared.css";

import { useMemo, useState } from "react";
import { ArrowDown } from "lucide-react";


const RELEASE_BASE = "https://github.com/HyperlinkVR/discord_rpc/releases/latest/download/hyperlinkvr_discord_rpc-";
const SOURCE_URL = "https://github.com/HyperlinkVR/discord_rpc";

const DownloadButton = ({ platform }: { platform: string }) => {
    const download_link = useMemo(() => {
        switch (platform) {
            case "Windows":
                return `${RELEASE_BASE}win.exe`;
            case "Mac":
                return `${RELEASE_BASE}macos`;
            case "Linux":
                return `${RELEASE_BASE}linux`;
            default:
                return null;
        }
    }, [platform]);

    const icon = useMemo(() => {
        switch (platform) {
            case "Windows":
                return "../windows.svg";
            case "Mac":
                return "../mac.svg";
            case "Linux":
                return "../linux.svg";
            default:
                return null;
        }
    }, [platform]);

    if (!download_link || !icon) {
        return null;
    }

    return (
        <a href={download_link} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center space-x-4 w-full">
            <img src={icon} alt={`${platform} icon`} className="w-6 h-6" />
            <span>Download for {platform}</span>
        </a>
    );
};

export const App = () => {
    const [show_all, setShowAll] = useState(false);

    const detected_platform = useMemo(() => {
        const platform = navigator.platform.toLowerCase();
        if (platform.includes("win")) {
            return "Windows";
        } else if (platform.includes("mac")) {
            return "Mac";
        } else if (platform.includes("linux")) {
            return "Linux";
        } else {
            setShowAll(true);
            return undefined;
        }
    }, []);
    
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
            <h1 className="text-4xl font-bold mb-4">HyperlinkVR Discord Rich Presence Bridge</h1>
            <p className="text-lg text-gray-400 text-center mb-16">
                This program allows HyperlinkVR to display your current activity in Discord.<br/>
                Download and install your platform's executable, and it will automatically be invoked by the extension.
            </p>

            {!show_all && detected_platform && (
                <div className="flex flex-col items-center gap-2">
                    <DownloadButton platform={detected_platform} />

                    <button
                        className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded cursor-pointer mt-2 w-full flex items-center justify-center gap-4"
                        onClick={() => setShowAll(true)}
                    >
                        <ArrowDown />
                        Show all platforms
                    </button>
                </div>
            )}

            {show_all && (
                <div className="space-y-4">
                    <DownloadButton platform="Windows" />
                    <DownloadButton platform="Mac" />
                    <DownloadButton platform="Linux" />
                </div>
            )}

            <p className="text-sm text-gray-500 mt-8">
                Open source on <a href={SOURCE_URL} className="text-blue-500 hover:underline">GitHub</a>
            </p>
        </div>
    );
}

// TODO: once a consistent style is set across pages, move this to that
