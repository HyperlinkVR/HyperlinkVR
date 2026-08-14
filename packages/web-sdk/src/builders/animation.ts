import {
    Animation,
    AnimationInput,
    AnimationSchema,
    HexColor,
    InterpolationType,
    KeyframeTrack,
    KeyframeTrackSchema,
    KeyframeTrackSelector,
    QuaternionInterpolationType
} from "@hyperlinkvr/vr-engine-schemas";
import {BaseBuilder} from "./base";

import {BindingMap} from "./triggers";

// loosely a created object dispatch, which is the only form that can resolve interaction binding names
export interface AnimationTargetHost {
    readonly object: { readonly id: string };
    readonly bindings: BindingMap;
}

// a bare object reference or id resolves transform channels only
export type AnimationTarget = string | { readonly id: string } | AnimationTargetHost;

const is_host = (target: AnimationTarget): target is AnimationTargetHost =>
    typeof target !== "string" && "bindings" in target;

const resolve_object_id = (target: AnimationTarget): string => {
    if (typeof target === "string") {
        if (!target) {
            throw new Error("Animation track target object ID is empty");
        }
        return target;
    }

    const object_id = is_host(target) ? target.object.id : target.id;

    if (!object_id) {
        throw new Error("Animation track target must be an object, object dispatch, or an object ID");
    }

    return object_id;
};


// parse dot syntax into segments for consistency
const resolve_property = (property: string | string[]): string[] => {
    const segments = Array.isArray(property) ? property : property.split(".");

    if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
        throw new Error(`Animation track property "${property}" is empty or has an empty segment`);
    }

    return segments;
};

// interaction channels are authored against binding names, which the engine never stores
// the name is swapped for its id here, matching how trigger targets resolve
const resolve_binding_segments = (target: AnimationTarget, segments: string[]): string[] => {
    if (segments[0] !== "interactions" || segments.length < 3) {
        return segments;
    }

    if (!is_host(target)) {
        throw new Error(
            "Interaction channels need a created object to resolve the binding name against. " +
            "Pass the creation dispatch result rather than a raw object ID or object reference."
        );
    }

    const [prefix, binding_name, ...rest] = segments;
    const binding_id = target.bindings.get(binding_name);

    if (!binding_id) {
        const known = [...target.bindings.keys()].map((name) => `"${name}"`).join(", ");
        throw new Error(
            `Animation track references binding "${binding_name}", which matches no named binding on the target object. Known bindings: ${known || "none"}.`
        );
    }

    return [prefix, binding_id, ...rest];
};

abstract class BaseKeyframeTrackBuilder<TValue> {
    protected readonly _selector: KeyframeTrackSelector;
    protected readonly _type: string;
    protected readonly _keyframes: Array<{ time: number; value: TValue }> = [];

    // dotted string or explicit segment array
    protected constructor(type: string, target: AnimationTarget, property: string | string[]) {
        this._type = type;
        this._selector = {
            object_id: resolve_object_id(target),
            property: resolve_binding_segments(target, resolve_property(property))
        };
    }

    add_keyframe(time_ms: number, value: TValue) {
        const clash = this._keyframes.find((keyframe) => keyframe.time === time_ms);
        if (clash) {
            throw new Error(`A keyframe already exists at ${time_ms}ms on this track`);
        }

        this._keyframes.push({time: time_ms, value});
        return this;
    }

    add_keyframes(keyframes: Array<{ time: number; value: TValue }>) {
        for (const keyframe of keyframes) {
            this.add_keyframe(keyframe.time, keyframe.value);
        }
        return this;
    }

    protected abstract _to_input(): unknown;

    build(): KeyframeTrack {
        if (this._keyframes.length === 0) {
            const property = this._selector.property.join(".");
            throw new Error(`Track for "${property}" has no keyframes`);
        }

        return KeyframeTrackSchema.parse(this._to_input());
    }
}

// boolean and string tracks hold their value until the next keyframe, so they take no interpolation
class DiscreteKeyframeTrackBuilder<TValue> extends BaseKeyframeTrackBuilder<TValue> {
    constructor(type: string, target: AnimationTarget, property: string | string[]) {
        super(type, target, property);
    }

    protected _to_input() {
        return {
            selector: this._selector,
            type: this._type,
            keyframes: this._keyframes
        };
    }
}

class ContinuousKeyframeTrackBuilder<
    TValue,
    TInterpolation extends string = InterpolationType
> extends BaseKeyframeTrackBuilder<TValue> {
    #interpolation?: TInterpolation;

    constructor(type: string, target: AnimationTarget, property: string | string[]) {
        super(type, target, property);
    }

    set_interpolation(interpolation: TInterpolation) {
        this.#interpolation = interpolation;
        return this;
    }

    protected _to_input() {
        return {
            selector: this._selector,
            type: this._type,
            interpolation: this.#interpolation,
            keyframes: this._keyframes
        };
    }
}

export const KeyframeTrackBuilder = {
    boolean: (target: AnimationTarget, property: string | string[]) =>
        new DiscreteKeyframeTrackBuilder<boolean>("boolean", target, property),

    string: (target: AnimationTarget, property: string | string[]) =>
        new DiscreteKeyframeTrackBuilder<string>("string", target, property),

    number: (target: AnimationTarget, property: string | string[]) =>
        new ContinuousKeyframeTrackBuilder<number>("number", target, property),

    vector2: (target: AnimationTarget, property: string | string[]) =>
        new ContinuousKeyframeTrackBuilder<[number, number]>("vector2", target, property),

    vector3: (target: AnimationTarget, property: string | string[]) =>
        new ContinuousKeyframeTrackBuilder<[number, number, number]>("vector3", target, property),

    quaternion: (target: AnimationTarget, property: string | string[]) =>
        new ContinuousKeyframeTrackBuilder<
            [number, number, number, number],
            QuaternionInterpolationType
        >("quaternion", target, property),

    color: (target: AnimationTarget, property: string | string[]) =>
        new ContinuousKeyframeTrackBuilder<HexColor>("color", target, property),

    // shortcuts for transform properties as they are common
    position: (target: AnimationTarget) =>
        new ContinuousKeyframeTrackBuilder<[number, number, number]>(
            "vector3", target, ["transform", "position"]
        ),

    rotation: (target: AnimationTarget) =>
        new ContinuousKeyframeTrackBuilder<
            [number, number, number, number],
            QuaternionInterpolationType
        >("quaternion", target, ["transform", "rotation"]),

    scale: (target: AnimationTarget) =>
        new ContinuousKeyframeTrackBuilder<[number, number, number]>(
            "vector3", target, ["transform", "scale"]
        )
};

export class AnimationBuilder extends BaseBuilder<AnimationInput> {
    constructor() {
        super({tracks: []} as AnimationInput);
    }

    named(name: string) {
        this._internal.binding = {...this._internal.binding, name};
        return this;
    }

    add_track(track: KeyframeTrack) {
        this._internal.tracks.push(track);
        return this;
    }

    add_tracks(tracks: KeyframeTrack[]) {
        this._internal.tracks.push(...tracks);
        return this;
    }

    set_tracks(tracks: KeyframeTrack[]) {
        this._internal.tracks = tracks;
        return this;
    }

    // longer than the last keyframe holds final values before looping, shorter truncates
    // if unset, duration is automatically set to the last keyframe's time
    set_duration(duration_ms: number) {
        this._internal.duration_ms = duration_ms;
        return this;
    }

    loops(loop = true) {
        this._internal.loop = loop;
        return this;
    }

    autoplay(autoplay = true) {
        this._internal.autoplay = autoplay;
        return this;
    }

    build(): Animation {
        if (this._internal.tracks.length === 0) {
            throw new Error("Animation has no tracks");
        }

        if (!this._internal.binding?.name && !this._internal.autoplay) {
            console.warn("Animation has no binding name and does not autoplay, so nothing can ever start it!");
        }

        return AnimationSchema.parse(this._internal);
    }
}
