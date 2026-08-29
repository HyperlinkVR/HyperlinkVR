import { HyperlinkSplash } from "@hyperlinkvr/ui-dom";
import { useEffect, useState } from "react";



import { Scoreboard } from "./components/Scoreboard";
import { useGameState } from "./hooks/useGameState";


export const App = () => {
    const {hole} = useGameState();
    
    const [hyperlink_ready, setHyperlinkReady] = useState(false);
    useEffect(() => {
        if (typeof (window as any).hyperlinkvr === "undefined") {
            return;
        }

        hyperlinkvr.on_ready(() => {
            setHyperlinkReady(true);
        });
    }, []);

    if (hole === 0) {
        return hyperlink_ready ? <p>Press start game to begin!</p> : <HyperlinkSplash />;
    } else {
        return <Scoreboard />;
    }
}
