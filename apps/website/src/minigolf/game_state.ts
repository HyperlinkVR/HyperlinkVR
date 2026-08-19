import type { Marker } from "@hyperlinkvr/web-sdk/src/markers";

import { show_hole, show_result, show_stroke } from "./hud";
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

let start_markers: Map<string, Marker>;

export const load_start_markers = async (offset_pos?: [number, number, number]) => {
    start_markers = await hyperlinkvr.markers.load("./course.glb", {
        transform_offset: {
            position: offset_pos || [0, 0, 0]
        },
        name_regex: /^marker_start_/i,
    });
}

export const next_hole = () => {
    if (!start_markers) {
        throw new Error("Start markers not loaded yet");
    }

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

export const scored_on_hole = (username: string | null) => {
    if (current_hole === 0) {
        return;
    }

    const state = players.get(username);
    if (!state) {
        throw new Error(`Player ${username} not found`);
    }

    state.finished_this_hole = true;
    show_stroke(state.strokes_this_hole, username);

    const start_marker = start_markers.get(current_hole.toString());
    if (!start_marker) {
        throw new Error(`Start marker for hole ${current_hole} not found`);
    }

    console.log(`Player ${username} scored on hole ${current_hole} with ${state.strokes_this_hole} strokes`);

    const par = (start_marker.properties.par ?? 3) as number; // default par to 3 if not specified
    show_result(username, state.strokes_this_hole, par);
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

    if (state.finished_this_hole) {
        return;
    }

    show_stroke(state.strokes_this_hole + 1, username);
}
