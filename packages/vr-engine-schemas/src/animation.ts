import { z } from "zod";
import { HexColorSchema } from "./colors";
import {bindable} from "./binding";

export const KeyframeTrackSelectorSchema = z.object({
    object_id: z.string().min(1),
    property: z.array(z.string().min(1)).min(1)
});
export type KeyframeTrackSelector = z.infer<typeof KeyframeTrackSelectorSchema>;

export const KeyframeDiscreteTypeSchema = z.enum(["boolean", "string"]);
export type KeyframeDiscreteType = z.infer<typeof KeyframeDiscreteTypeSchema>;

export const KeyframeContinuousTypeSchema = z.enum([
    "number",
    "vector2",
    "vector3",
    "quaternion",
    "color"
]);
export type KeyframeContinuousType = z.infer<typeof KeyframeContinuousTypeSchema>;

export const KeyframeTypeSchema = z.union([
    KeyframeDiscreteTypeSchema,
    KeyframeContinuousTypeSchema
]);
export type KeyframeType = z.infer<typeof KeyframeTypeSchema>;


const VALUE_SCHEMAS = {
    boolean: z.boolean(),
    string: z.string(),
    number: z.number(),
    vector2: z.tuple([z.number(), z.number()]),
    vector3: z.tuple([z.number(), z.number(), z.number()]),
    quaternion: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    color: HexColorSchema
} satisfies Record<KeyframeType, z.ZodTypeAny>;

export const InterpolationTypeSchema = z.enum(["linear", "discrete", "smooth"]);
export type InterpolationType = z.infer<typeof InterpolationTypeSchema>;

// quaternion cannot be smooth interpolated
export const QuaternionInterpolationTypeSchema = z.enum(["linear", "discrete"]);
export type QuaternionInterpolationType = z.infer<typeof QuaternionInterpolationTypeSchema>;

const make_keyframe_schema = <T extends z.ZodTypeAny>(value_schema: T) => z.object({
    time: z.number().nonnegative(), // milliseconds from start
    value: value_schema
});

const make_discrete_keyframe_track_schema = <T extends KeyframeDiscreteType>(type: T) => z.object({
    selector: KeyframeTrackSelectorSchema,
    type: z.literal(type),
    keyframes: z.array(make_keyframe_schema(VALUE_SCHEMAS[type])).min(1)
});
const make_continuous_keyframe_track_schema = <
    T extends KeyframeContinuousType,
    I extends z.ZodTypeAny
>(type: T, interpolation_schema: I) => z.object({
    selector: KeyframeTrackSelectorSchema,
    type: z.literal(type),
    interpolation: interpolation_schema,
    // keyframe values compose with the target's pose captured at play-start rather than replacing it.
    // vectors/numbers add, quaternions multiply. discrete tracks can't be relative, so it lives here.
    relative: z.boolean().default(false),
    keyframes: z.array(make_keyframe_schema(VALUE_SCHEMAS[type])).min(1)
});

export const BooleanKeyframeTrackSchema = make_discrete_keyframe_track_schema("boolean");
export type BooleanKeyframeTrack = z.infer<typeof BooleanKeyframeTrackSchema>;

export const StringKeyframeTrackSchema = make_discrete_keyframe_track_schema("string");
export type StringKeyframeTrack = z.infer<typeof StringKeyframeTrackSchema>;

export const NumberKeyframeTrackSchema = make_continuous_keyframe_track_schema(
    "number",
    InterpolationTypeSchema.default("linear")
);
export type NumberKeyframeTrack = z.infer<typeof NumberKeyframeTrackSchema>;

export const Vector2KeyframeTrackSchema = make_continuous_keyframe_track_schema(
    "vector2",
    InterpolationTypeSchema.default("linear")
);
export type Vector2KeyframeTrack = z.infer<typeof Vector2KeyframeTrackSchema>;

export const Vector3KeyframeTrackSchema = make_continuous_keyframe_track_schema(
    "vector3",
    InterpolationTypeSchema.default("linear")
);
export type Vector3KeyframeTrack = z.infer<typeof Vector3KeyframeTrackSchema>;

export const QuaternionKeyframeTrackSchema = make_continuous_keyframe_track_schema(
    "quaternion",
    QuaternionInterpolationTypeSchema.default("linear")
);
export type QuaternionKeyframeTrack = z.infer<typeof QuaternionKeyframeTrackSchema>;

export const ColorKeyframeTrackSchema = make_continuous_keyframe_track_schema(
    "color",
    InterpolationTypeSchema.default("linear")
);
export type ColorKeyframeTrack = z.infer<typeof ColorKeyframeTrackSchema>;

const KeyframeTrackVariantSchema = z.discriminatedUnion("type", [
    BooleanKeyframeTrackSchema,
    StringKeyframeTrackSchema,
    NumberKeyframeTrackSchema,
    Vector2KeyframeTrackSchema,
    Vector3KeyframeTrackSchema,
    QuaternionKeyframeTrackSchema,
    ColorKeyframeTrackSchema
]);

export const KeyframeTrackSchema = KeyframeTrackVariantSchema
    .superRefine((track, ctx) => {
        const times = new Set<number>();

        for (const [index, keyframe] of track.keyframes.entries()) {
            if (times.has(keyframe.time)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["keyframes", index, "time"],
                    message: `Duplicate keyframe time ${keyframe.time}. A zero length segment cannot be interpolated.`
                });
                return;
            }
            times.add(keyframe.time);
        }
    })
    // three interpolation requires ascending time
    .transform((track) => ({
        ...track,
        keyframes: [...track.keyframes].sort((left, right) => left.time - right.time)
    }));

export type KeyframeTrack = z.infer<typeof KeyframeTrackSchema>;
export type KeyframeTrackInput = z.input<typeof KeyframeTrackSchema>;

export const AnimationSchema = bindable({
    tracks: z.array(KeyframeTrackSchema).min(1),
    duration_ms: z.number().int().positive().optional(),
    loop: z.boolean().optional(),
    autoplay: z.boolean().optional()
});
export type Animation = z.infer<typeof AnimationSchema>;
export type AnimationInput = z.input<typeof AnimationSchema>;
