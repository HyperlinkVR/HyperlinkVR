import { show_hole, show_result, show_stroke } from "./hud";
import { get_start_markers } from "./markers";
import type { Player } from "./types";


const h = hyperlinkvr.builders;

interface PlayerState {
    score: number;
    strokes_this_hole: number;
    finished_this_hole: boolean;
    ball: typeof h.EnginePrefabObjectCreationResult;
    putter: typeof h.EnginePrefabObjectCreationResult;
}

const create_player_state = (
    ball: typeof h.EnginePrefabObjectCreationResult,
    putter: typeof h.EnginePrefabObjectCreationResult
): PlayerState => {
    return {
        score: 0,
        strokes_this_hole: 0,
        finished_this_hole: false,
        ball,
        putter
    };
};

const players = new Map<string | null, PlayerState>();

export const add_player = async (player: Player) => {
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

    const created_putter = await new h.EngineObjectDispatchBuilder(putter)
        .set_position(0, 3, -1)
        .create();

    const created_ball = await new h.EngineObjectDispatchBuilder(ball)
        .set_position(0, 2.5, -2)
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
};

let current_hole = 0;

export const get_current_hole = () => current_hole;

export const next_hole = () => {
    const start_markers = get_start_markers();

    current_hole++;

    const start_marker = start_markers.get(current_hole.toString());
    if (!start_marker) {
        throw new Error(`Start marker for hole ${current_hole} not found`);
    }
    
    for (const [username, state] of players.entries()) {
        state.strokes_this_hole = 0;
        state.finished_this_hole = false;

        // teleport ball to hole start point defined by marker
        state.ball.modify().set_position(start_marker.transform.position).apply();

        show_stroke(1, username);
    }

    show_hole(current_hole, start_marker.properties);
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
    if (!owner) {
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
}

export const stroke_at_rest = (username: string | null) => {
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
    }
};

if (process.env.NODE_ENV === "development") {
    (window as any).dev_cheats = dev_cheats;
}
