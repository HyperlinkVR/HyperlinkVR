import type * as hvr from "@hyperlinkvr/web-sdk";



import { show_hole, show_oob, show_result, show_stroke } from "./hud";
import { are_markers_loaded, get_start_markers } from "./markers";


const h = hyperlinkvr.builders;

interface PlayerState {
    score: number;
    strokes_this_hole: number;
    finished_this_hole: boolean;
    ball: hvr.builders.EnginePrefabObjectCreationResult;
    putter: hvr.builders.EnginePrefabObjectCreationResult;
    last_pos: [number, number, number] | null;
}

const create_player_state = (
    ball: hvr.builders.EnginePrefabObjectCreationResult,
    putter: hvr.builders.EnginePrefabObjectCreationResult
): PlayerState => {
    return {
        score: 0,
        strokes_this_hole: 0,
        finished_this_hole: false,
        ball,
        putter,
        last_pos: null
    };
};

const players = new Map<string | null, PlayerState>();

interface StoreSnapshot {
    hole: number;
    players: Map<string | null, Omit<PlayerState, "last_pos">>; // last_pos will be there, but don't use it, it won't be updated in real time
}

const game_state_listeners = new Set<() => void>();
let game_state_snapshot: StoreSnapshot = {
    hole: 0,
    players: new Map(players)
};
const notify_game_state = () => {
    game_state_snapshot = {
        hole: current_hole,
        players: new Map(players)
    };
    for (const cb of game_state_listeners) {
        cb();
    }
};
export const game_state_store = {
    subscribe: (cb: () => void) => {
        game_state_listeners.add(cb);
        return () => {
            game_state_listeners.delete(cb);
        };
    },
    get_snapshot: () => game_state_snapshot
};

let hole_pars: Map<number, number> | null = null;
let total_par = 0;

const hole_info_listeners = new Set<() => void>();
let hole_info_snapshot: {
    holes: Record<number, { par: number }>;
    total_par: number;
} | null = null;
const notify_hole_info = () => {
    if (!are_markers_loaded()) {
        hole_info_snapshot = null;
    } else {
        const holes: Record<number, { par: number }> = {};
        for (const [hole_num, par] of hole_pars!) {
            holes[hole_num] = { par };
        }

        hole_info_snapshot = {
            holes,
            total_par
        };
    }

    for (const cb of hole_info_listeners) {
        cb();
    }
}
export const hole_info_store = {
    subscribe: (cb: () => void) => {
        hole_info_listeners.add(cb);
        return () => {
            hole_info_listeners.delete(cb);
        };
    },
    get_snapshot: () => hole_info_snapshot
};

export const compute_hole_pars = () => {
    if (hole_pars !== null) {
        return;
    }

    hole_pars = new Map<number, number>();
    total_par = 0;

    const start_markers = get_start_markers();

    for (const [name, marker] of start_markers) {
        const hole_num = parseInt(name);
        const par = marker.properties?.par;
        if (par !== undefined) {
            hole_pars.set(hole_num, par as number);
            total_par += par as number;
        }
    }

    notify_hole_info();
};

export const add_player = async (player: hvr.players.Player, spawn_pos: [number, number, number] = [0, 0, 0]) => {
    const username = await player.get_username();
    if (players.has(username)) {
        console.warn(`Player ${username} already exists`);
        return;
    }

    // random neon putter color, and the ball automatically matches just like real mini golf :)
    const putter = new h.GolfPutterPrefabBuilder().random_color().build();
    const ball = new h.GolfBallPrefabBuilder()
        .named("ball")
        .set_color(putter.color)
        .build();

    const putter_pos = [spawn_pos[0], spawn_pos[1] + 3, spawn_pos[2] - 1] as [number, number, number];
    const ball_pos = [spawn_pos[0], spawn_pos[1] + 2.5, spawn_pos[2] - 2] as [number, number, number];

    const created_putter = await new h.EngineObjectDispatchBuilder(putter)
        .set_position(...putter_pos)
        .create();

    const created_ball = await new h.EngineObjectDispatchBuilder(ball)
        .set_position(...ball_pos)
        .on("ball", (e) => {
            if (e.kind !== "golf-ball-prefab") return;

            if (e.payload.type === "struck") {
                take_stroke(username);
            } else if (e.payload.type === "at-rest") {
                stroke_at_rest(username);
            }
        })
        .create();

    players.set(username, create_player_state(created_ball, created_putter));
    notify_game_state();
};

let current_hole = 0;

// cheap guard against oob message when teleporting to next hole, its enough for now (the only consequence is a hud message)
let going_to_next_hole = false;

export const next_hole = () => {
    const start_markers = get_start_markers();

    current_hole++;

    const start_marker = start_markers.get(current_hole.toString());
    if (!start_marker) {
        throw new Error(`Start marker for hole ${current_hole} not found`);
    }

    going_to_next_hole = true;
    
    for (const [username, state] of players.entries()) {
        state.strokes_this_hole = 0;
        state.finished_this_hole = false;
        state.last_pos = null;

        // teleport ball to hole start point defined by marker
        state.ball
            .modify()
            .set_position(start_marker.transform.position)
            .apply();

        show_stroke(1, username);
    }

    notify_game_state();

    setTimeout(() => {
        going_to_next_hole = false;
    }, 250);

    show_hole(current_hole, start_marker.properties);
}

export const out_of_bounds = (ball_object_id: string) => {
    const owner = get_owner_of_ball(ball_object_id);
    if (owner === undefined) {
        throw new Error(`Ball with object ID ${ball_object_id} not found`);
    }

    const state = players.get(owner);
    if (!state) {
        throw new Error(`Player ${owner} not found`);
    }

    if (state.finished_this_hole || going_to_next_hole) {
        return;
    }

    let pos = state.last_pos;
    if (!pos) {
        // fall back to the start of the hole if we don't have a last position
        const start_markers = get_start_markers();
        const start_marker = start_markers.get(current_hole.toString());
        if (!start_marker) {
            throw new Error(`Start marker for hole ${current_hole} not found`);
        }

        pos = start_marker.transform.position;
    }

    // teleport ball to last position
    state.ball.modify().set_position(pos).apply();

    show_oob(owner);
}

export const get_owner_of_ball = (ball_object_id: string) => {
    for (const [username, state] of players.entries()) {
        if (state.ball.object.id === ball_object_id) {
            return username;
        }
    }

    return undefined;
}

export const get_ball_of_player = (username: string | null) => {
    const state = players.get(username);
    if (!state) {
        throw new Error(`Player ${username} not found`);
    }

    return state.ball;
}

export const get_ball_by_object_id = (ball_object_id: string) => {
    const owner = get_owner_of_ball(ball_object_id);
    if (owner === undefined) {
        throw new Error(`Ball with object ID ${ball_object_id} not found`);
    }

    return get_ball_of_player(owner);
}

export const scored_on_hole = async (username: string | null) => {
    if (current_hole === 0) {
        return;
    }

    const state = players.get(username);
    if (!state) {
        throw new Error(`Player ${username} not found`);
    }

    if (state.finished_this_hole) {
        return;
    }

    state.finished_this_hole = true;
    notify_game_state();

    show_stroke(state.strokes_this_hole, username);

    const start_markers = get_start_markers();

    const start_marker = start_markers.get(current_hole.toString());
    if (!start_marker) {
        throw new Error(`Start marker for hole ${current_hole} not found`);
    }

    console.log(`Player ${username} scored on hole ${current_hole} with ${state.strokes_this_hole} strokes`);

    const par = (start_marker.properties.par ?? 3) as number; // default par to 3 if not specified
    await show_result(username, state.strokes_this_hole, par);

    // after the result shown, if all players have finished, move to the next hole
    const all_finished = Array.from(players.values()).every((s) => s.finished_this_hole);
    if (all_finished) {
        next_hole();
    }
}

export const take_stroke = (username: string | null) => {
    if (current_hole === 0) {
        return;
    }

    const state = players.get(username);
    if (!state) {
        throw new Error(`Player ${username} not found`);
    }

    if (state.finished_this_hole) {
        return;
    }

    state.strokes_this_hole++;
    state.score++;

    notify_game_state();
}

export const stroke_at_rest = (username: string | null) => {
    if (current_hole === 0) {
        return;
    }

    const state = players.get(username);
    if (!state) {
        throw new Error(`Player ${username} not found`);
    }

    // record where the stroke ended up as an easy way to recover from oob (doesnt catch all cases ofc but better than start)
    state.ball.refresh().then(() => {
        state.last_pos = state.ball.object.transform.position;
    });

    if (state.finished_this_hole) {
        return;
    }

    show_stroke(state.strokes_this_hole + 1, username);
}


const dev_cheats = {
    skip_to_hole: (hole_number: number) => {
        const start_markers = get_start_markers();

        const start_marker = start_markers.get(hole_number.toString());
        if (!start_marker) {
            throw new Error(`Start marker for hole ${hole_number} not found`);
        }

        current_hole = hole_number;

        for (const [username, state] of players.entries()) {
            state.strokes_this_hole = 0;
            state.finished_this_hole = false;

            // teleport ball to hole start point defined by marker
            state.ball.modify().set_position(start_marker.transform.position).apply();

            show_stroke(1, username);
        }

        notify_game_state();

        show_hole(current_hole, start_marker.properties);
    },

    tp_to_start: (hole_number: number) => {
        const start_markers = get_start_markers();
        const start_marker = start_markers.get(hole_number.toString());
        if (!start_marker) {
            throw new Error(`Start marker for hole ${hole_number} not found`);
        }

        for (const [username, state] of players.entries()) {
            const player = new hyperlinkvr.players.Player(username);
            player.teleport_to(start_marker.transform.position, 0);
        }
    },

    tp_to_ball: async (username: string | null = null) => {
        const state = players.get(username);
        if (!state) {
            throw new Error(`Player ${username} not found`);
        }

        const player = new hyperlinkvr.players.Player(username);
        await state.ball.refresh();
        const ball_obj = state.ball.object;
        player.teleport_to(ball_obj.transform.position, ball_obj.transform.rotation[1]);
    },

    tp_ball_to_me: async (username: string | null = null) => {
        const state = players.get(username);
        if (!state) {
            throw new Error(`Player ${username} not found`);
        }

        const player = new hyperlinkvr.players.Player(username);
        const player_pos = await player.get_position();
        state.ball
            .modify()
            .set_position(player_pos.position)
            .apply();
    }
};

if (process.env.NODE_ENV === "development") {
    (window as any).dev_cheats = dev_cheats;
}
