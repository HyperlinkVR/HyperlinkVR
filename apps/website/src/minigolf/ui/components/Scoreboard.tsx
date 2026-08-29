import { use, useMemo } from "react";
import { useGameState } from "../hooks/useGameState";
import { useHoleInfo } from "../hooks/useHoleInfo";


const whoami_promise = hyperlinkvr.auth.whoami();
export const Scoreboard = () => {
    const {players, hole} = useGameState();
    const hole_info = useHoleInfo();

    const whoami = use(whoami_promise);

    const my_username = useMemo(() => {
       if (!whoami) return null;
       if (!whoami.info) return "Guest";
       // TODO: make this api suck less, maybe just have stuff return the username rather than null (resolve early), or at least make a hook library for it
       return `${whoami.info.identity.name}@${whoami.info.identity.host}`;
    }, [whoami]);

    const this_hole_info = useMemo(() => {
        if (!hole_info) return null;
        return hole_info.holes[hole];
    }, [hole_info, hole]);

    const running_par = useMemo(() => {
        if (!hole_info || hole === 0) return null;

        // could use ref and effect, but feels safer to just recalc every time (avoid strict mode double render issues)
        let running_par = 0;
        for (let i = 1; i <= hole; i++) {
            running_par += hole_info.holes[i]!.par;
        }

        return running_par;
    }, [hole_info, hole]);

    const sorted_scoreboard = useMemo(() => {
        if (!players || !running_par) return null;

        return Array.from(players).sort((a, b) => {
            const a_score = a[1].score - running_par;
            const b_score = b[1].score - running_par;

            if (a_score !== b_score) {
                return a_score - b_score;
            }

            // if scores are equal, sort by username TODO: name not resolved here so not perfect sort, good enough for now (maybe a kick to improve the api!)
            return (a[0] || "Guest").localeCompare(b[0] || "Guest")
        });
    }, [players, running_par]);

    if (!running_par || !this_hole_info || !sorted_scoreboard) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Hole {hole} • Par {this_hole_info.par}</h1>

            <table>
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>This hole</th>
                        <th>Total</th>
                        <th>± Par</th>
                        <th>Waiting?</th>
                    </tr>
                </thead>

                <tbody>
                    {sorted_scoreboard.map(([username, state]) => (
                        <tr key={username}>
                            <td>{username || my_username}</td>
                            <td>{state.strokes_this_hole}</td>
                            <td>{state.score}</td>
                            <td>{state.score - running_par}</td>
                            <td>{state.finished_this_hole ? "✔" : ""}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
