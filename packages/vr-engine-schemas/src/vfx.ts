import { z } from "zod";

import { BindingConfigSchema } from "./binding";

export interface VFXUniformSpec {
    field: string;
    uniform: string;
    min?: number;
    max?: number;
    default: number;
}

export interface VFXImpulseSpec {
    uniform: string;
    time_uniform?: string;
    decay: number;
    default_magnitude: number;
}

interface BaseVFXPassSpec {
    type: string;
    category: "vfx";
    kind: "declarative" | "impulse";
    time_driven: boolean;
    uniforms: readonly VFXUniformSpec[];
}

export interface DeclarativeVFXPassSpec extends BaseVFXPassSpec {
    kind: "declarative";
}

export interface ImpulseVFXPassSpec extends BaseVFXPassSpec {
    kind: "impulse";
    impulse: VFXImpulseSpec;
}

export type VFXPassSpec = DeclarativeVFXPassSpec | ImpulseVFXPassSpec;

export const VFX_SPECS = {
    "grayscale": {
        type: "grayscale",
        category: "vfx",
        kind: "declarative",
        time_driven: false,
        uniforms: []
    },
    "rgb-shift": {
        type: "rgb-shift",
        category: "vfx",
        kind: "declarative",
        time_driven: false,
        uniforms: [
            { field: "amount", uniform: "amount", min: 0, max: 0.05, default: 0.002 }, // uv offset between channels
            { field: "angle", uniform: "angle", min: 0, max: Math.PI * 2, default: 1.0 } // shift direction (radians)
        ]
    },
    "bad-tv": {
        type: "bad-tv",
        category: "vfx",
        kind: "declarative",
        time_driven: true,
        uniforms: [
            { field: "distortion", uniform: "distortion", min: 0, default: 0.5 }, // thick wave distortion
            { field: "fine_distortion", uniform: "distortion2", min: 0, default: 2.5 }, // fine grain
            { field: "speed", uniform: "speed", default: 0.45 }, // vertical travel speed
            { field: "roll_speed", uniform: "rollSpeed", default: 0 } // vertical roll speed
        ]
    },
    "static": {
        type: "static",
        category: "vfx",
        kind: "declarative",
        time_driven: true,
        uniforms: [
            { field: "amount", uniform: "amount", min: 0, max: 1, default: 0.03 }, // noise strength
            { field: "size", uniform: "size", min: 0, default: 4.0 } // grain size in pixels
        ]
    },
    "film": {
        type: "film",
        category: "vfx",
        kind: "declarative",
        time_driven: true,
        uniforms: [
            { field: "intensity", uniform: "intensity", min: 0, max: 1, default: 0.4 } // grain + scanline strength
        ]
    },
    "screen-shake": {
        type: "screen-shake",
        category: "vfx",
        kind: "impulse",
        time_driven: false,
        // pulse writes the magnitude into u_magnitude; it decays 10%/frame and u_time
        // is driven from the clock so the jitter animates while it fades
        impulse: { uniform: "u_magnitude", time_uniform: "u_time", decay: 0.9, default_magnitude: 0.05 },
        uniforms: []
    }
} as const satisfies Record<string, VFXPassSpec>;

export type VFXEffectType = keyof typeof VFX_SPECS;

// build a zod schema for a given effect spec, with the right type and default values for its uniforms
const build_effect_schema = <S extends VFXPassSpec>(spec: S) => {
    const shape: Record<string, z.ZodTypeAny> = {
        type: z.literal(spec.type),
        enabled: z.boolean().default(true),
        binding: BindingConfigSchema.optional()
    };

    for (const u of spec.uniforms) {
        let n = z.number();
        if (u.min !== undefined) n = n.min(u.min);
        if (u.max !== undefined) n = n.max(u.max);
        shape[u.field] = n.default(u.default);
    }

    return z.object(shape) as unknown as z.ZodObject<
        {
            type: z.ZodLiteral<S["type"]>;
            enabled: z.ZodDefault<z.ZodBoolean>;
            binding: z.ZodOptional<typeof BindingConfigSchema>;
        } & Record<S["uniforms"][number]["field"], z.ZodDefault<z.ZodNumber>>
    >;
};

export const GrayscaleEffectSchema = build_effect_schema(VFX_SPECS["grayscale"]);
export type GrayscaleEffect = z.infer<typeof GrayscaleEffectSchema>;
export type GrayscaleEffectInput = z.input<typeof GrayscaleEffectSchema>;

export const RGBShiftEffectSchema = build_effect_schema(VFX_SPECS["rgb-shift"]);
export type RGBShiftEffect = z.infer<typeof RGBShiftEffectSchema>;
export type RGBShiftEffectInput = z.input<typeof RGBShiftEffectSchema>;

export const BadTVEffectSchema = build_effect_schema(VFX_SPECS["bad-tv"]);
export type BadTVEffect = z.infer<typeof BadTVEffectSchema>;
export type BadTVEffectInput = z.input<typeof BadTVEffectSchema>;

export const StaticEffectSchema = build_effect_schema(VFX_SPECS["static"]);
export type StaticEffect = z.infer<typeof StaticEffectSchema>;
export type StaticEffectInput = z.input<typeof StaticEffectSchema>;

export const FilmEffectSchema = build_effect_schema(VFX_SPECS["film"]);
export type FilmEffect = z.infer<typeof FilmEffectSchema>;
export type FilmEffectInput = z.input<typeof FilmEffectSchema>;

export const ScreenShakeEffectSchema = build_effect_schema(VFX_SPECS["screen-shake"]);
export type ScreenShakeEffect = z.infer<typeof ScreenShakeEffectSchema>;
export type ScreenShakeEffectInput = z.input<typeof ScreenShakeEffectSchema>;

export const VFXEffectSchema = z.discriminatedUnion("type", [
    GrayscaleEffectSchema,
    RGBShiftEffectSchema,
    BadTVEffectSchema,
    StaticEffectSchema,
    FilmEffectSchema,
    ScreenShakeEffectSchema
]);
export type VFXEffect = z.infer<typeof VFXEffectSchema>;
export type VFXEffectInput = z.input<typeof VFXEffectSchema>;

export const VFXStackSchema = z.array(VFXEffectSchema).default([]);
export type VFXStack = z.infer<typeof VFXStackSchema>;
export type VFXStackInput = z.input<typeof VFXStackSchema>;
