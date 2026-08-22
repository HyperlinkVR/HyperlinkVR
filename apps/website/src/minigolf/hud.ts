const h = hyperlinkvr.builders;

export const countdown_to_start = async () => {
    return new Promise<void>(async (resolve) => {
        const countdown = await h.hud_text("countdown", "Starting in 3...")
            .set_slot("middle-center")
            .set_font_size(48)
            .create();

        let count = 3;
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdown.set_text(`Starting in ${count}...`);
            } else {
                clearInterval(interval);
                countdown.destroy();
                resolve();
            }
        }, 1000);
    });
}

interface HoleExtraDetails {
    nickname?: string;
    par?: number;
}

let hole_hud: typeof h.HUDTextHandle | null = null;
let par_hud: typeof h.HUDTextHandle | null = null;

export const show_hole = async (hole_number: number, details: HoleExtraDetails = {}) => {
    if (!hole_hud) {
        const hole_text = await h.hud_text("hole", details.nickname ? `Hole ${hole_number}: ${details.nickname}` : `Hole ${hole_number}`)
            .set_slot("top-center")
            .set_font_size(36)
            .create();

        hole_hud = hole_text;
    } else {
        hole_hud.set_text(details.nickname ? `Hole ${hole_number}: ${details.nickname}` : `Hole ${hole_number}`);
    }

    if (!details.par) {
        details.par = 3; // default par if not provided
    }

    if (!par_hud) {
        const par_text = await h.hud_text("par", `Par ${details.par}`)
            .set_slot("top-right")
            .set_font_size(36)
            .create();

        par_hud = par_text;
    } else {
        par_hud.set_text(`Par ${details.par}`);
    }
}

const player_stroke_huds = new Map<string | null, typeof h.HUDTextHandle>();

export const show_stroke = async (stroke_number: number, username: string | null) => {
    if (!player_stroke_huds.has(username)) {
        const stroke_text = await h.hud_text("stroke", `Stroke ${stroke_number}`)
            .set_slot("top-left")
            .set_font_size(36)
            .player(username)
            .create();

        player_stroke_huds.set(username, stroke_text);
        return;
    }

    const stroke_hud = player_stroke_huds.get(username)!;
    stroke_hud.set_text(`Stroke ${stroke_number}`);
}

const PAR_DIFFS = {
    "-2": "Eagle",
    "-1": "Birdie",
    "0": "Par",
    "1": "Bogey",
    "2": "Double Bogey",
    "3": "Triple Bogey",
    // past this just show the score
} as const;

const get_result_text = (strokes: number, par: number) => {
    if (strokes === 1) {
        return "Hole-in-one!";
    }

    const diff = strokes - par;
    if (diff in PAR_DIFFS) {
        return PAR_DIFFS[diff as unknown as keyof typeof PAR_DIFFS];
    }

    return `${strokes} strokes`;
}

export const show_result = async (username: string | null, strokes: number, par: number) => {
    const result_text = get_result_text(strokes, par);
    const result_hud = await h.hud_text("result", result_text)
        .set_slot("middle-center")
        .set_font_size(64)
        .set_vr_anchor("head")
        .player(username)
        .create();

    setTimeout(() => {
        result_hud.destroy();
    }, 4000);
}

export const show_oob = async (username: string | null) => {
    const oob_hud = await h.hud_text("oob", "Out of bounds!")
        .set_slot("middle-center")
        .set_font_size(64)
        .set_vr_anchor("head")
        .player(username)
        .create();

    setTimeout(() => {
        oob_hud.destroy();
    }, 2000);
}
