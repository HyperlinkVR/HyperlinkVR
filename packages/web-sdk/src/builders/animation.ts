import type {
    Animation,
    AnimationInput, CreatedAnimation,
    HexColor,
    InterpolationType,
    KeyframeTrack,
    KeyframeTrackSelector,
    QuaternionInterpolationType
} from "@hyperlinkvr/vr-engine-schemas";
import {
    AnimationSchema,
    KeyframeTrackSchema
} from "@hyperlinkvr/vr-engine-schemas";
import {BaseBuilder} from "./base";

import type {BindingMap} from "./triggers";
import {send_via_rtc} from "../messenger";

// loosely a created object dispatch, which is the only form that can resolve interaction binding names
export interface AnimationTargetHost {
    readonly object: { readonly id: string };
    readonly bindings: BindingMap;
    readonly channels: string[];
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
    const binding_id = target.bindings.get(binding_name!);

    if (!binding_id) {
        const known = [...target.bindings.keys()].map((name) => `"${name}"`).join(", ");
        throw new Error(
            `Animation track references binding "${binding_name}", which matches no named binding on the target object. Known bindings: ${known || "none"}.`
        );
    }

    return [prefix, binding_id, ...rest];
};

// exchange interaction ids in error message known list for their name
const to_display_path = (path: string, bindings: BindingMap): string => {
    const segments = path.split(".");
    if (segments[0] !== "interactions" || segments.length < 3) {
        return path;
    }

    for (const [name, id] of bindings) {
        if (id === segments[1]) {
            return [segments[0], name, ...segments.slice(2)].join(".");
        }
    }

    return path;
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

        const path = this._selector.property.join(".");

        // the engine reports resolved paths at create time, so check if the target has the channel
        if (is_host(target) && !target.channels.includes(path)) {
            const known = target.channels
                .map((channel) => `"${to_display_path(channel, target.bindings)}"`)
                .join(", ");

            throw new Error(
                `Animation track targets "${to_display_path(path, target.bindings)}", which is not an animatable channel on this object. Available: ${known || "none"}.`
            );
        }
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

const animation_command = async (animation_id: string, command: string, args?: any) =>
    await send_via_rtc({
        action: "HVRSDK_ANIMATION_COMMAND",
        animation_id,
        command,
        args
    });

export interface AnimationCreationResult {
    animation: CreatedAnimation;
    bindings: BindingMap;
    destroy: () => Promise<void>;
    play: () => Promise<any>;
    pause: () => Promise<any>;
    stop: () => Promise<any>;
    restart: () => Promise<any>;
    seek: (time_ms: number) => Promise<any>;
}

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

    async create(): Promise<AnimationCreationResult> {
        const animation = this.build();

        // triggers can resolve against animation name too
        const bindings = new Map<string, string>();
        if (animation.binding?.name) {
            const binding_id = crypto.randomUUID();
            animation.binding = {...animation.binding, id: binding_id};
            bindings.set(animation.binding.name!, binding_id);
        }

        const response = await send_via_rtc({
            action: "HVRSDK_CREATE_ANIMATION",
            animation
        });

        const created: CreatedAnimation = response.animation;

        return {
            animation: created,
            bindings,
            destroy: async () => {
                await send_via_rtc({
                    action: "HVRSDK_DESTROY_ANIMATION",
                    animation_id: created.id
                });
            },
            play: () => animation_command(created.id, "play"),
            pause: () => animation_command(created.id, "pause"),
            stop: () => animation_command(created.id, "stop"),
            restart: () => animation_command(created.id, "restart"),
            seek: (time_ms: number) => animation_command(created.id, "seek", {time_ms})
        };
    }
}

/*
usage example

const h = hyperlinkvr.builders;

// kinematic-pos so the group owns the pose. body_owns_pose_for skips fixed and dynamic, so a lift on either would silently not move
const platform = new h.CustomObjectBuilder()
    .set_mesh("https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/refs/heads/main/2.0/Box/glTF-Binary/Box.glb")
    .set_physics(new h.PhysicsSystemBuilder()
        .set_rigid_body(new h.KinematicPosRigidBodyBuilder()
            .set_collider(new h.ColliderBuilder().box([0.5, 0.1, 0.5]).build())
            .build()
        )
        .build()
    )
    .build();

const created_lift = await new h.EngineObjectDispatchBuilder(platform)
    .set_position(0, 0.2, -4)
    .create();

// no physics, so this object's group owns its pose outright
const lamp = new h.CustomObjectBuilder()
    .add_interaction("bulb", new h.PointLightInteractionBuilder()
        .set_color("#ffdd88")
        .set_intensity(0)
        .set_distance(10)
        .build())
    .build();

const created_lamp = await new h.EngineObjectDispatchBuilder(lamp)
    .set_position(0, 3, -4)
    .create();

// loops from creation, no trigger needed
const lift_cycle = await new h.AnimationBuilder()
    .named("lift_cycle")
    .loops()
    .autoplay()
    .add_track(h.KeyframeTrackBuilder.position(created_lift)
        .add_keyframe(0, [0, 0.2, -4])
        .add_keyframe(3000, [0, 3.0, -4])
        .add_keyframe(6000, [0, 0.2, -4])
        .build())
    .add_track(h.KeyframeTrackBuilder.rotation(created_lift)
        .add_keyframe(0, [0, 0, 0, 1])
        .add_keyframe(3000, [0, 0.7071, 0, 0.7071])
        .add_keyframe(6000, [0, 0, 0, 1])
        .build())
    .create();

console.log("Lift animation:", lift_cycle.animation.id);

// interaction channel on a different object, started by a button
const lamp_pulse = await new h.AnimationBuilder()
    .named("lamp_pulse")
    .add_track(h.KeyframeTrackBuilder.number(created_lamp, "interactions.bulb.intensity")
        .set_interpolation("smooth")
        .add_keyframe(0, 0)
        .add_keyframe(400, 6)
        .add_keyframe(1600, 0)
        .build())
    .create();

const button = new h.ButtonPrefabBuilder()
    .named("pulse_button")
    .set_label("Pulse")
    .set_body_color(0xff0000)
    .build();

await new h.EngineObjectDispatchBuilder(button)
    .set_position(1, 1, -2)
    .add_trigger(new h.TriggerBuilder("pulse_button")
        .add_target(new h.TriggerTargetBuilder(
            {target: lamp_pulse, name: "lamp_pulse"},
            "restart"
        ).build())
        .set_cooldown(1600)
        .build())
    .create();

// exercises the command path rather than the trigger path. the lift should resume
// from where it stopped, not restart
setTimeout(() => lift_cycle.pause(), 10000);
setTimeout(() => lift_cycle.play(), 13000);
 */