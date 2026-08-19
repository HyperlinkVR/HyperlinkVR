import { show_hole, show_stroke } from "./hud";
import type { Player } from "./types";


const h = hyperlinkvr.builders;

interface PlayerState {
    score: number;
    strokes_this_hole: number;
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
}

let current_hole = 0;

export const get_current_hole = () => current_hole;

export const next_hole = () => {
    current_hole++;
    
    for (const [username, state] of players.entries()) {
        state.strokes_this_hole = 0;

        // TODO: teleport ball to hole start point defined by markers
        state.ball.modify().set_position(0, 2.5, -2).apply();
    }
    
    show_hole(current_hole);
}

export const take_stroke = (username: string | null) => {
    if (current_hole === 0) {
        return;
    }

    const state = players.get(username);
    if (!state) {
        throw new Error(`Player ${username} not found`);
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

    show_stroke(state.strokes_this_hole + 1, username);
}
