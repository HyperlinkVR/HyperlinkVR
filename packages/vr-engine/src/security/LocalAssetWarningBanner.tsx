import {useSetting} from "@hyperlinkvr/react";

export const LocalAssetWarningBanner = () => {
    const [allow_local_anywhere, setAllowLocalAnywhere] = useSetting(
        "devtools_dangerously_allow_localhost_fetch"
    );

    if (!allow_local_anywhere) {
        return null;
    }

    return (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm text-black font-sans shadow-md">
            <span>
                Remote worlds can load assets from your local network. Only use this with worlds you trust.
            </span>

            <button
                onClick={() => setAllowLocalAnywhere(false)}
                className="ml-2 rounded bg-black/20 px-2 py-0.5 font-bold hover:bg-black/30 transition cursor-pointer">
                Turn off
            </button>
        </div>
    );
};

// TODO: also show an ingame prompt when this is enabled when trying to go cross worlds
