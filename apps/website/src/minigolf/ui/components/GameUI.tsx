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

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-sky-700 via-emerald-800 to-emerald-950 p-6 font-sans text-white">
            {hole === 0 ? (
                hyperlink_ready ? (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <span className="text-6xl">⛳</span>
                        <h1 className="text-4xl font-bold tracking-tight">Minigolf</h1>
                        <p className="max-w-sm text-lg text-emerald-100/80">
                            Press the{" "}
                            <span className="font-semibold text-white">Start</span> button to
                            begin the game.
                        </p>
                        <span className="animate-pulse rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-medium uppercase tracking-widest text-emerald-100/70">
                            Waiting for players…
                        </span>
                    </div>
                ) : (
                    <HyperlinkSplash />
                )
            ) : (
                <Scoreboard />
            )}
        </div>
    );
};
