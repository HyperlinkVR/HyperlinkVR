import { HyperlinkSplash } from "@hyperlinkvr/ui-dom";
import { useEffect, useState } from "react";


import { useGameState } from "../hooks/useGameState";
import { Scoreboard } from "./Scoreboard";

export const GameUI = () => {
    const { hole } = useGameState();

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
        return hyperlink_ready ? (
            <p>Press Start to begin!</p>
        ) : (
            <HyperlinkSplash />
        );
    } else {
        return <Scoreboard />;
    }
};
