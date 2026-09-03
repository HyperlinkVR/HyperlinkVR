import type {
    BasketballHoopPrefab,
    BasketballHoopPrefabInput,
    ButtonPrefab,
    ButtonPrefabInput,
    FloatingText2DPrefab,
    FloatingText3DPrefab,
    FloatingTextPrefabShading,
    GolfBallPrefab,
    GolfBallPrefabInput,
    GolfPutterPrefab,
    GolfPutterPrefabInput,
    HexColor,
    HexNumericalColor,
    ReflectiveMirrorPrefab,
    ReflectiveMirrorPrefabInput,
    StandardPrefab,
    StandardPrefabInput,
    StandardPrefabName,
    TextPrefabBaseInput,
    TextSignPrefab
} from "@hyperlinkvr/vr-engine-schemas";
import {
    BasketballHoopPrefabSchema,
    ButtonPrefabSchema,
    FloatingText2DPrefabSchema,
    FloatingText3DPrefabSchema,
    GolfBallPrefabSchema,
    GolfPutterPrefabSchema,
    HexColorSchema,
    HexNumericalColorSchema,
    ReflectiveMirrorPrefabSchema,
    StandardPrefabSchema,
    TextSignPrefabSchema
} from "@hyperlinkvr/vr-engine-schemas";



import { HSVHueBagRandomiser, to_hex } from "../color";
import { send_via_rtc } from "../messenger";
import { BaseBuilder } from "./base";


const prefab_command = async (object_id: string, command: string, args?: any) => {
    try {
        const res = await send_via_rtc({
            action: "HVRSDK_PREFAB_COMMAND",
            object_id,
            command,
            args
        });

        if ("response" in res) {
            return res.response;
        } else {
            return undefined;
        }
    } catch (err) {
        console.error("Error sending prefab command:", err);
        throw err;
    }
}

/** @group Prefabs */
export class StandardPrefabBuilder extends BaseBuilder<StandardPrefabInput> {
    constructor(name: StandardPrefabName) {
        super({type: "prefab", name} as StandardPrefabInput);
    }

    build(): StandardPrefab {
        return StandardPrefabSchema.parse(this._internal);
    }
}

/** @group Prefabs */
export class ButtonPrefabBuilder extends BaseBuilder<ButtonPrefabInput> {
    constructor() {
        super({type: "prefab", name: "button"} as ButtonPrefabInput);
    }

    named(name: string) {
        this._internal.binding = {...this._internal.binding, name};
        return this;
    }

    set_label(label: string) {
        this._internal.label = label;
        return this;
    }

    set_body_color(color: HexNumericalColor) {
        this._internal.body_color = HexNumericalColorSchema.parse(color);
        return this;
    }

    set_label_color(color: HexNumericalColor) {
        this._internal.label_color = HexNumericalColorSchema.parse(color);
        return this;
    }

    set_reports_press(reports: boolean) {
        this._internal.report_press = reports;
        return this;
    }

    set_reports_release(reports: boolean) {
        this._internal.report_release = reports;
        return this;
    }

    set_fixed(fixed: boolean) {
        this._internal.fixed = fixed;
        return this;
    }

    grabbable(grabbable = true) {
        this._internal.grabbable = grabbable;
        return this;
    }

    build(): ButtonPrefab {
        return ButtonPrefabSchema.parse(this._internal);
    }
}

/** @group Prefabs */
export class BasketballHoopPrefabBuilder extends BaseBuilder<BasketballHoopPrefabInput> {
    constructor() {
        super({type: "prefab", name: "basketball_hoop"} as BasketballHoopPrefabInput);
    }

    named(name: string) {
        this._internal.binding = {...this._internal.binding, name};
        return this;
    }

    set_enable_sfx(enable: boolean) {
        this._internal.enable_sfx = enable;
        return this;
    }

    set_enable_particles(enable: boolean) {
        this._internal.enable_particles = enable;
        return this;
    }

    build(): BasketballHoopPrefab {
        return BasketballHoopPrefabSchema.parse(this._internal);
    }
}

/** @group Prefabs */
export class ReflectiveMirrorPrefabBuilder extends BaseBuilder<ReflectiveMirrorPrefabInput> {
    constructor() {
        super({type: "prefab", name: "reflective_mirror"} as ReflectiveMirrorPrefabInput);
    }

    set_width(width: number) {
        this._internal.width = width;
        return this;
    }

    set_height(height: number) {
        this._internal.height = height;
        return this;
    }

    set_tint(color: HexNumericalColor) {
        this._internal.tint = HexNumericalColorSchema.parse(color);
        return this;
    }

    build(): ReflectiveMirrorPrefab {
        return ReflectiveMirrorPrefabSchema.parse(this._internal);
    }
}

class TextPrefabBuilderBase extends BaseBuilder<TextPrefabBaseInput & {depth?: number, style?: string, style_parameters?: Record<string, any>, shading?: FloatingTextPrefabShading}> {
    constructor(type: "floating_text_2d" | "floating_text_3d" | "text_sign") {
        super({type: "prefab", name: type} as unknown as TextPrefabBaseInput);
    }

    set_text(text: string) {
        this._internal.text = text;
        return this;
    }

    set_font_size(size: number) {
        this._internal.font_size = size;
        return this;
    }

    set_color(color: HexNumericalColor) {
        this._internal.color = HexNumericalColorSchema.parse(color);
        return this;
    }


    /** @internal */
    static _make_api(object_id: string) {
        return {
            set_text: (text: string) => prefab_command(object_id, "set_text", {text}),
            set_font_size: (size: number) => prefab_command(object_id, "set_font_size", {size}),
            set_color: (color: HexNumericalColor) => prefab_command(object_id, "set_color", {color})
        };
    }
}

/** @group Prefabs */
export class FloatingText2DPrefabBuilder extends TextPrefabBuilderBase {
    constructor() {
        super("floating_text_2d");
    }

    set_shading(shading: FloatingTextPrefabShading) {
        this._internal.shading = shading;
        return this;
    }

    build(): FloatingText2DPrefab {
        return FloatingText2DPrefabSchema.parse(this._internal);
    }


    /** @internal */
    static override _make_api(object_id: string) {
        return {
            ...super._make_api(object_id),
            set_shading: (shading: FloatingTextPrefabShading) => prefab_command(object_id, "set_shading", {shading})
        };
    }
}

/** @group Prefabs */
export class FloatingText3DPrefabBuilder extends TextPrefabBuilderBase {
    constructor() {
        super("floating_text_3d");
    }

    set_depth(depth: number) {
        this._internal.depth = depth;
        return this;
    }

    set_shading(shading: FloatingTextPrefabShading) {
        this._internal.shading = shading;
        return this;
    }

    build(): FloatingText3DPrefab {
        return FloatingText3DPrefabSchema.parse(this._internal);
    }


    /** @internal */
    static override _make_api(object_id: string) {
        return {
            ...super._make_api(object_id),
            set_depth: (depth: number) => prefab_command(object_id, "set_depth", {depth}),
            set_shading: (shading: FloatingTextPrefabShading) => prefab_command(object_id, "set_shading", {shading})
        };
    }
}

/** @group Prefabs */
export class TextSignPrefabBuilder extends TextPrefabBuilderBase {
    constructor() {
        super("text_sign");
    }

    set_style(style: "default" | "wooden" | "nameplate") {
        this._internal.style = style;
        return this;
    }

    set_style_parameters(params: Record<string, any>) {
        this._internal.style_parameters = params;
        return this;
    }

    build(): TextSignPrefab {
        return TextSignPrefabSchema.parse(this._internal);
    }


    /** @internal */
    static override _make_api(object_id: string) {
        return {
            ...super._make_api(object_id),
            set_style: (style: "default" | "wooden" | "nameplate") => prefab_command(object_id, "set_style", {style}),
            set_style_parameters: (params: Record<string, any>) => prefab_command(object_id, "set_style_parameters", {params})
        };
    }
}

/** @group Prefabs */
export class GolfBallPrefabBuilder extends BaseBuilder<GolfBallPrefabInput> {
    constructor() {
        super({type: "prefab", name: "golf_ball"} as GolfBallPrefabInput);
    }

    named(name: string) {
        this._internal.binding = {...this._internal.binding, name};
        return this;
    }

    set_color(color: HexColor) {
        this._internal.color = HexColorSchema.parse(color);
        return this;
    }

    set_locks_out(locks_out: boolean) {
        this._internal.locks_out = locks_out;
        return this;
    }

    set_damping_enabled(enabled: boolean) {
        this._internal.damping = enabled;
        return this;
    }

    build(): GolfBallPrefab {
        return GolfBallPrefabSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string) {
        return {
            set_color: (color: HexColor) => prefab_command(object_id, "set_color", {color}),
            set_locks_out: (locks_out: boolean) => prefab_command(object_id, "set_locks_out", {locks_out}),

            lock: () => prefab_command(object_id, "lock"),

            // by default, this only clears the lock requested by the lock() command
            // in force mode, it will also clear the lock imposed by the ball itself (via locks_out, which prevents the ball from being putt until it comes to rest)
            unlock: (force = false) => prefab_command(object_id, "unlock", {force}),

            set_damping_enabled: (enabled: boolean) => prefab_command(object_id, "set_damping_enabled", {enabled})
        };
    }
}

// matching the hot pink defined in the material
const PUTTER_SATURATION_PERCENT = 97.84;
const PUTTER_VALUE_PERCENT = 90.59;
const PUTTER_HUE_START_POINT_DEG = 332.12;

// the gap in values to ensure a good spread when spawning many putters
const PUTTER_RANDOM_HUE_STEP_SIZE_DEG = 30;

const putter_color_randomiser = new HSVHueBagRandomiser(
    PUTTER_HUE_START_POINT_DEG,
    PUTTER_RANDOM_HUE_STEP_SIZE_DEG,
    PUTTER_SATURATION_PERCENT,
    PUTTER_VALUE_PERCENT
);

/** @group Prefabs */
export class GolfPutterPrefabBuilder extends BaseBuilder<GolfPutterPrefabInput> {
    constructor() {
        super({type: "prefab", name: "golf_putter"} as GolfPutterPrefabInput);
    }

    set_color(color: HexColor) {
        this._internal.color = HexColorSchema.parse(color);
        return this;
    }

    random_color() {
        this._internal.color = to_hex(putter_color_randomiser.generate_color());
        return this;
    }

    build(): GolfPutterPrefab {
        return GolfPutterPrefabSchema.parse(this._internal);
    }
}

/** @internal **/
export const _PREFAB_API_MAKERS = {
    "floating_text_2d": FloatingText2DPrefabBuilder._make_api,
    "floating_text_3d": FloatingText3DPrefabBuilder._make_api,
    "text_sign": TextSignPrefabBuilder._make_api,
    "golf_ball": GolfBallPrefabBuilder._make_api
} as Record<string, (object_id: string) => any>;
