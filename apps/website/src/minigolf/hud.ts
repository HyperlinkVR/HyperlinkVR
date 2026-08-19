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

export const show_hole = async (hole_number: number) => {
    const hole_text = await h.hud_text("hole", `Hole ${hole_number}`)
        .set_slot("top-center")
        .set_font_size(36)
        .create();

    setTimeout(() => {
        hole_text.destroy();
    }, 3000);
}

export const show_stroke = async (stroke_number: number, username: string | null) => {
    const stroke_text = await h.hud_text("stroke", `Stroke ${stroke_number}`)
        .set_slot("middle-center")
        .set_font_size(36)
        .player(username)
        .create();

    setTimeout(() => {
        stroke_text.destroy();
    }, 2000);
}
