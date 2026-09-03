import { HexColor } from "@hyperlinkvr/vr-engine-schemas";

export const get_clear_fg_color = (bg_color: HexColor): HexColor => {
    // convert hex number to rgb
    const r = (bg_color >> 16) & 0xff;
    const g = (bg_color >> 8) & 0xff;
    const b = bg_color & 0xff;

    // calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // return black or white based on luminance
    return luminance > 0.5 ? 0x000000 : 0xffffff;
}
