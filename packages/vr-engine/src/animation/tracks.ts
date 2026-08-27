import type {
    KeyframeTrack as ThreeKeyframeTrack,
    Interpolant
} from "three";
import {
    BooleanKeyframeTrack,
    Color,
    ColorKeyframeTrack,
    InterpolateDiscrete,
    InterpolateLinear,
    InterpolateSmooth,
    NumberKeyframeTrack,
    QuaternionKeyframeTrack,
    StringKeyframeTrack,
    VectorKeyframeTrack
} from "three";
import type {KeyframeTrack, KeyframeType} from "@hyperlinkvr/vr-engine-schemas";

const THREE_INTERPOLATION = {
    linear: InterpolateLinear,
    discrete: InterpolateDiscrete,
    smooth: InterpolateSmooth
} as const;

// hex to linear working space once at compile, so the interpolant lerps in the space the renderer actually uses rather than in sRGB
const scratch_color = new Color();
const flatten_color = (value: number | string) => {
    scratch_color.set(value as never);
    return [scratch_color.r, scratch_color.g, scratch_color.b];
};

type KeyframeValue = number | boolean | string;

const flatten_values = (track: KeyframeTrack): Array<KeyframeValue> => {
    if (track.type === "color") {
        return track.keyframes.flatMap((keyframe) => flatten_color(keyframe.value as number | string));
    }

    if (track.type === "boolean" || track.type === "string" || track.type === "number") {
        return track.keyframes.map((keyframe) => keyframe.value as KeyframeValue);
    }

    return track.keyframes.flatMap((keyframe) => keyframe.value as number[]);
};

const build_three_track = (track: KeyframeTrack): ThreeKeyframeTrack => {
    const times = track.keyframes.map((keyframe) => keyframe.time);
    const values = flatten_values(track);
    const interpolation = "interpolation" in track ? THREE_INTERPOLATION[track.interpolation] : undefined;

    // the name only feeds PropertyBinding, which is unused here, but the constructor rejects undefined
    switch (track.type) {
        case "boolean":
            return new BooleanKeyframeTrack("", times, values as boolean[]);
        case "string":
            return new StringKeyframeTrack("", times, values as string[]);
        case "number":
            return new NumberKeyframeTrack("", times, values as number[], interpolation);
        case "quaternion":
            return new QuaternionKeyframeTrack("", times, values as number[], interpolation);
        case "color":
            return new ColorKeyframeTrack("", times, values as number[], interpolation);
        default:
            return new VectorKeyframeTrack("", times, values as number[], interpolation);
    }
};

export interface CompiledTrack {
    object_id: string;
    path: string;
    value_type: KeyframeType;
    evaluate: (time_ms: number) => ArrayLike<number | boolean | string>;
    scalar: boolean;
    end_time: number;
}

const build_discrete_evaluator = (track: KeyframeTrack): (time_ms: number) => ArrayLike<KeyframeValue> => {
    const times = track.keyframes.map((keyframe) => keyframe.time);
    const values = track.keyframes.map((keyframe) => keyframe.value);

    return (time_ms: number) => {
        let low = 0;
        let high = times.length - 1;

        // settles on the highest index whose time is at or below the sample
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);

            if (times[middle]! <= time_ms) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return [values[low]] as ArrayLike<KeyframeValue>;
    };
};

export const compile_track = (track: KeyframeTrack): CompiledTrack => {
    const discrete = track.type === "boolean" || track.type === "string";

    let evaluate: (time_ms: number) => ArrayLike<number | boolean | string>;

    if (discrete) {
        evaluate = build_discrete_evaluator(track);
    } else {
        const interpolant = (build_three_track(track) as unknown as {createInterpolant: () => Interpolant}).createInterpolant();
        evaluate = (time_ms: number) => interpolant.evaluate(time_ms);
    }

    return {
        object_id: track.selector.object_id,
        path: track.selector.property.join("."),
        value_type: track.type,
        evaluate,
        scalar: discrete || track.type === "number",
        // keyframes are sorted by the schema transform, so the last one is the end
        end_time: track.keyframes[track.keyframes.length - 1]!.time
    };
};
