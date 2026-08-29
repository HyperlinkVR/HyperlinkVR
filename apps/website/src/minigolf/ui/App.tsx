import { HyperlinkSplash } from "@hyperlinkvr/ui-dom";
import { lazy } from "react";

const GameUI = lazy(() =>
    import("./components/GameUI").then((module) => ({ default: module.GameUI }))
);

export const App = () => {
    if (typeof (window as any).hyperlinkvr === "undefined") {
        return <HyperlinkSplash />;
    }

    // only load gameui if hyperlinkvr is installed (or else it'll error out)
    // TODO: is there a better way to do this so we can improve the sdk around it? or is it just a case of the assumptions the game code makes and the fact its in globals
    return <GameUI />;
}
