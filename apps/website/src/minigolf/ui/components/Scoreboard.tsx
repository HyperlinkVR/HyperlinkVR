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
        return (
            <div className="flex h-full items-center justify-center text-lg font-medium text-emerald-100/70">
                Loading scoreboard…
            </div>
        );
    }

    const format_relative = (relative: number) => {
        if (relative === 0) return "E";
        return relative > 0 ? `+${relative}` : `${relative}`;
    };

    const relative_color = (relative: number) => {
        if (relative < 0) return "text-emerald-300";
        if (relative > 0) return "text-rose-300";
        return "text-slate-300";
    };

    return (
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-emerald-600/30 to-emerald-500/10 px-6 py-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/80">
                        Now playing
                    </p>
                    <h1 className="text-2xl font-bold text-white">Hole {hole}</h1>
                </div>
                <div className="rounded-lg bg-white/10 px-4 py-2 text-center">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-emerald-200/70">
                        Par
                    </p>
                    <p className="text-2xl font-bold text-white">{this_hole_info.par}</p>
                </div>
            </div>

            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="text-left text-[0.7rem] font-semibold uppercase tracking-wider text-emerald-200/60">
                        <th className="px-6 py-3">Player</th>
                        <th className="px-3 py-3 text-center">This hole</th>
                        <th className="px-3 py-3 text-center">Total</th>
                        <th className="px-3 py-3 text-center">± Par</th>
                        <th className="px-6 py-3 text-center">Done</th>
                    </tr>
                </thead>

                <tbody className="divide-y divide-white/5">
                    {sorted_scoreboard.map(([username, state], index) => {
                        const is_me = !username;
                        const relative = state.score - running_par;

                        return (
                            <tr
                                key={username}
                                className={
                                    (is_me ? "bg-emerald-400/10 " : "") +
                                    "transition-colors hover:bg-white/5"
                                }
                            >
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="w-4 text-xs font-semibold text-emerald-200/50">
                                            {index + 1}
                                        </span>
                                        <div style={{backgroundColor: `#${state.color.toString(16).padStart(6, "0")}`}} className="h-3 w-3 rounded-full" />
                                        <span className="font-medium text-white">
                                            {username || my_username}
                                        </span>
                                        {is_me && (
                                            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-emerald-200">
                                                You
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-3 text-center text-slate-200">
                                    {state.strokes_this_hole}
                                </td>
                                <td className="px-3 py-3 text-center font-semibold text-white">
                                    {state.score}
                                </td>
                                <td className={"px-3 py-3 text-center font-bold " + relative_color(relative)}>
                                    {format_relative(relative)}
                                </td>
                                <td className="px-6 py-3 text-center">
                                    {state.finished_this_hole ? (
                                        <span className="text-emerald-400">✔</span>
                                    ) : (
                                        <span className="text-slate-500">·</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
