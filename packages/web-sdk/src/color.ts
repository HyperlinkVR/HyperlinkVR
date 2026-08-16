import {AnyColor, colord} from "colord";

export class HSVHueBagRandomiser {
    #hue_step_bag: number[] = [];

    readonly #hue_start_point_deg: number;
    readonly #hue_step_size_deg: number;
    readonly #hue_step_count: number;
    readonly #saturation: number;
    readonly #value: number;

    constructor(
        hue_start_point_deg: number,
        random_hue_step_size_deg: number,
        saturation_percent: number, // not a float, the percentage!
        value_percent: number
    ) {
        this.#hue_start_point_deg = hue_start_point_deg;
        this.#hue_step_size_deg = random_hue_step_size_deg;
        this.#hue_step_count = Math.floor(360 / random_hue_step_size_deg);
        this.#saturation = saturation_percent;
        this.#value = value_percent;

        if (this.#saturation < 1) {
            console.warn("HSVHueBagRandomiser: saturation_percent is less than 1, which may not be intended. It should be a percentage (0-100), not a float (0-1).");
        }

        if (this.#value < 1) {
            console.warn("HSVHueBagRandomiser: value_percent is less than 1, which may not be intended. It should be a percentage (0-100), not a float (0-1).");
        }

        this.#refill_hue_step_bag();
    }

    #refill_hue_step_bag() {
        this.#hue_step_bag = Array.from({length: this.#hue_step_count}, (_, step_index) => step_index);

        for (let index = this.#hue_step_bag.length - 1; index > 0; index--) {
            const swap_index = Math.floor(Math.random() * (index + 1));
            [this.#hue_step_bag[index], this.#hue_step_bag[swap_index]] = [this.#hue_step_bag[swap_index], this.#hue_step_bag[index]];
        }
    }

    #take_hue_step() {
        if (this.#hue_step_bag.length === 0) {
            this.#refill_hue_step_bag();
        }
        return this.#hue_step_bag.pop() as number;
    }

    generate_color() {
        const random_hue_deg = (this.#hue_start_point_deg + this.#take_hue_step() * this.#hue_step_size_deg) % 360;
        return {
            h: random_hue_deg,
            s: this.#saturation,
            v: this.#value
        }
    }
}

export const to_hex = (color: AnyColor) => {
    return colord(color).toHex();
}

// TODO: automatically apply to_hex on color schema inputs. either in the schema itself as a transform or just in builders
