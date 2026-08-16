import {BaseBuilder} from "./base";
import {
    BasketballHoopPrefab,
    BasketballHoopPrefabInput, BasketballHoopPrefabSchema,
    ButtonPrefab,
    ButtonPrefabInput,
    ButtonPrefabSchema, FloatingText2DPrefab, FloatingText2DPrefabSchema, FloatingText3DPrefab,
    FloatingText3DPrefabSchema, GolfPutterPrefab, GolfPutterPrefabInput, GolfPutterPrefabSchema,
    HexColor, HexColorSchema,
    HexNumericalColor,
    HexNumericalColorSchema, ReflectiveMirrorPrefab, ReflectiveMirrorPrefabInput, ReflectiveMirrorPrefabSchema,
    StandardPrefab, StandardPrefabInput, StandardPrefabName,
    StandardPrefabSchema, TextPrefabBaseInput, TextSignPrefab, TextSignPrefabSchema
} from "@hyperlinkvr/vr-engine-schemas";

export class StandardPrefabBuilder extends BaseBuilder<StandardPrefabInput> {
    constructor(name: StandardPrefabName) {
        super({type: "prefab", name} as StandardPrefabInput);
    }

    build(): StandardPrefab {
        return StandardPrefabSchema.parse(this._internal);
    }
}

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

class TextPrefabBuilderBase extends BaseBuilder<TextPrefabBaseInput & {depth?: number, style?: string, style_parameters?: Record<string, any>}> {
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
}

export class FloatingText2DPrefabBuilder extends TextPrefabBuilderBase {
    constructor() {
        super("floating_text_2d");
    }

    build(): FloatingText2DPrefab {
        return FloatingText2DPrefabSchema.parse(this._internal);
    }
}

export class FloatingText3DPrefabBuilder extends TextPrefabBuilderBase {
    constructor() {
        super("floating_text_3d");
    }

    set_depth(depth: number) {
        this._internal.depth = depth;
        return this;
    }

    build(): FloatingText3DPrefab {
        return FloatingText3DPrefabSchema.parse(this._internal);
    }
}

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
}

export class GolfPutterPrefabBuilder extends BaseBuilder<GolfPutterPrefabInput> {
    constructor() {
        super({type: "prefab", name: "golf_putter"} as GolfPutterPrefabInput);
    }

    set_color(color: HexColor) {
        this._internal.color = HexColorSchema.parse(color);
        return this;
    }

    random_color() {
        this._internal.color = undefined;
        return this;
    }

    build(): GolfPutterPrefab {
        return GolfPutterPrefabSchema.parse(this._internal);
    }
}
