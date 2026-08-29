import { useMemo } from "react";
import { Plus } from "lucide-react";

const ANIM_LOGO_URL = new URL("../../assets/hyperlinkvr_anim.svg", import.meta.url).href;
const BG_URL = new URL("../../assets/bg.webp", import.meta.url).href;

export const HyperlinkSplash = ({ custom_subtext, show_subtext_if_not_installed = false }: { custom_subtext?: string, show_subtext_if_not_installed?: boolean }) => {
    const has_installed = useMemo(() => typeof (window as any).hyperlinkvr !== "undefined", []);

    return (
        <div className="flex flex-col items-center justify-center h-screen w-screen text-center" style={{ backgroundImage: `url(${BG_URL})`, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="backdrop-blur-md flex flex-col items-center justify-center h-screen w-screen pb-32 px-4 text-white font-sans">
                <img src={ANIM_LOGO_URL} className="w-1/2 max-w-[300px] mb-6" />
                <h1 className="text-3xl font-bold mb-3 font-title">HyperlinkVR</h1>

                <p className="text-lg mb-2">There's a world behind this page.</p>

                {has_installed ? (
                    <>
                        <p className="text-md text-white/80 mb-4">Launch HyperlinkVR to step inside.</p>
                        {custom_subtext && (
                            <p className="text-md text-white/70 mb-4">{custom_subtext}</p>
                        )}
                    </>
                ) : (
                    <>
                        <p className="text-md text-white/80 my-1">Step inside with the HyperlinkVR extension.</p>
                        <p className="text-sm text-white/60 mb-6">Open worlds right in your browser, no headset needed.</p>
                        {custom_subtext && show_subtext_if_not_installed && (
                            <p className="text-md text-white/70 mb-6">{custom_subtext}</p>
                        )}
                        <a href="https://hyperlink.surf" target="_blank" rel="noopener noreferrer" className="mt-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex gap-2">
                            <Plus /> Get the extension
                        </a>
                        <p className="text-sm text-white/50 mt-4">Free and open source.</p>
                    </>
                )}
            </div>
        </div>
    );
}

// TODO: add a button that opens it/the popup right away? need to guard against abuse somehow though
