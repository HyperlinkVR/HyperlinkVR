import { useMemo } from "react";

const ANIM_LOGO_URL = new URL("../../assets/hyperlinkvr_anim.svg", import.meta.url).href;
const BG_URL= new URL("../../assets/bg.webp", import.meta.url).href;

export const HyperlinkSplash = ({custom_subtext, show_subtext_if_not_installed = false}: {custom_subtext?: string, show_subtext_if_not_installed?: boolean}) => {
    const has_installed = useMemo(() => typeof (window as any).hyperlinkvr !== "undefined", []);

    return (
        <div className="flex flex-col items-center justify-center h-screen w-screen text-center" style={{backgroundImage: `url(${BG_URL})`, backgroundSize: "cover", backgroundPosition: "center"}}>
            <div className="backdrop-blur-md flex flex-col items-center justify-center h-screen w-screen pb-32 px-4 text-white font-sans">
                <img src={ANIM_LOGO_URL} className="w-1/2 max-w-[300px] mb-4" />
                <h1 className="text-3xl font-bold font-title mb-2">HyperlinkVR</h1>
                <p className="text-lg mb-4">{has_installed ? "Launch HyperlinkVR to use this experience." : "Download and launch HyperlinkVR to use this experience."}</p>
                {custom_subtext && (show_subtext_if_not_installed || has_installed) && (
                    <p className="text-md mb-4">{custom_subtext}</p>
                )}

                {!has_installed && (
                    <>
                        <p>HyperlinkVR is a free, open-source VR social platform for the web! Download it now to join this experience.</p>
                        <a href="https://hyperlink.surf" target="_blank" rel="noopener noreferrer" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                            Download HyperlinkVR
                        </a>
                    </>
                )}
            </div>
        </div>
    );
}
