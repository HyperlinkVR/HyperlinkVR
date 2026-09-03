import type { ColliderOrCollection, DirectionalLightInteraction, DirectionalLightInteractionInput, FollowPlayerInteractionInput, GlobalAudioInteraction, GlobalAudioInteractionInput, GrabbableInteraction, GrabbableInteractionInput, GrabCollider, GrabOffsetInput, ParticleEmitterBehaviorInput, ParticleEmitterColorInput, ParticleEmitterInteraction, ParticleEmitterInteractionInput, ParticleEmitterRandomisableValueInput, ParticleEmitterShapeInput, ParticleEmitterVisualInput, PointLightInteraction, PointLightInteractionInput, PositionalAudioInteraction, PositionalAudioInteractionInput, RaycastAim, RaycastAimInput, RaycastInteraction, RaycastInteractionInput, RaycastRays, RaycastRaysInput, RaycastResult, RaycastSpace, RaycastTargets, RaycastTargetsInput, RaycastFiring, RaycastFiringInput, Rotation, SeatInteraction, SeatInteractionInput, SpotLightInteraction, SpotLightInteractionInput, TriggerVolumeInteraction, TriggerVolumeInteractionInput, TweenEasing } from "@hyperlinkvr/vr-engine-schemas";
import { DirectionalLightInteractionSchema, FollowPlayerInteractionSchema, GlobalAudioInteractionSchema, GrabbableInteractionSchema, ParticleEmitterBehaviorSchema, ParticleEmitterColorSchema, ParticleEmitterInteractionSchema, ParticleEmitterRandomisableValueSchema, ParticleEmitterShapeSchema, ParticleEmitterVisualSchema, PointLightInteractionSchema, PositionalAudioInteractionSchema, RaycastAimSchema, RaycastInteractionSchema, RaycastRaysSchema, RaycastTargetsSchema, RaycastFiringSchema, RotationSchema, SeatInteractionSchema, SpotLightInteractionSchema, TriggerVolumeInteractionSchema } from "@hyperlinkvr/vr-engine-schemas";



import { asset_url } from "../assets";
import { send_via_rtc } from "../messenger";
import type { Player } from "../players";
import { BaseBuilder } from "./base";


const interaction_command = async (object_id: string, interaction_id: string, command: string, args?: any) => {
    try {
        const res = await send_via_rtc({
            action: "HVRSDK_INTERACTION_COMMAND",
            object_id,
            interaction_id,
            command,
            args
        });

        if ("response" in res) {
            return res.response;
        } else {
            return undefined;
        }
    } catch (err) {
        console.error("Error sending interaction command:", err);
        throw err;
    }
}

/** @internal **/
export type InteractionMakeAPIFunc = (object_id: string, interaction_id: string) => any;

/**
 * @group Interactions
 */
export class GrabbableInteractionBuilder extends BaseBuilder<GrabbableInteractionInput> {
    constructor() {
        super({
            type: "grabbable"
        });
    }

    set_grab_collider(collider: GrabCollider) {
        this._internal.collider = collider;
        return this;
    }

    set_grab_distance(distance: number) {
        this._internal.grab_distance = distance;
        return this;
    }

    // these ones default to true, so having a default boolean here doesnt make sense, must explicitly set to false to disable

    set_snaps_to_hand(snaps: boolean) {
        this._internal.snaps_to_hand = snaps;
        return this;
    }

    set_grab_offset(offset: GrabOffsetInput) {
        if (!this._internal.snaps_to_hand) {
            throw new Error("Cannot set grab offset when snaps_to_hand is false. Set snaps_to_hand to true first.");
        }

        this._internal.grab_offset = offset;
        return this;
    }

    // these below are default false, so specifying .reports_grabs() should make it true by default

    sticky(sticky = true) {
        this._internal.sticky = sticky;
        return this;
    }

    reports_grabs(reports = true) {
        this._internal.report_grabs = reports;
        return this;
    }

    reports_releases(reports = true) {
        this._internal.report_releases = reports;
        return this;
    }

    reports_proximity(reports = true) {
        this._internal.report_proximity = reports;
        return this;
    }

    reports_trigger(reports = true) {
        this._internal.report_trigger = reports;
        return this;
    }

    // false only prevents using the throw button on flat mode (ui hint). we cant stop vr players throwing. use max_throw_speed = 0 to make it slip out their hand instead
    set_flat_throwable(throwable: boolean) {
        this._internal.flat_throwable = throwable;
        return this;
    }

    // the speed of the minimum throw on flat (tapping the throw key)
    set_min_flat_throw_speed(speed: number) {
        this._internal.min_flat_throw_speed = speed;
        return this;
    }

    // the maximum throw speed on flat and vr. note that an additional headroom of 1.2x is applied so that locomotion can add to the speed
    set_max_throw_speed(speed: number) {
        this._internal.max_throw_speed = speed;
        return this;
    }

    build(): GrabbableInteraction {
        return GrabbableInteractionSchema.parse(this._internal);
    }


    // TODO: set enabled/disabled, api to change that, api to change sticky/snaps to hand etc, api to eject
}

/**
 * @group Interactions
 *
 * @bindable events=TriggerVolumeInteractionPayload
 */
export class TriggerVolumeInteractionBuilder extends BaseBuilder<TriggerVolumeInteractionInput> {
    constructor() {
        super({type: "trigger-volume"} as TriggerVolumeInteractionInput);
    }

    set_collider(collider: ColliderOrCollection) {
        this._internal.collider = collider;
        return this;
    }

    set_reports_enter(reports: boolean) {
        this._internal.report_enter = reports;
        return this;
    }

    set_reports_exit(reports: boolean) {
        this._internal.report_exit = reports;
        return this;
    }

    ignore_hands(ignore = true) {
        this._internal.ignore_hands = ignore;
        return this;
    }

    ignore_torso(ignore = true) {
        this._internal.ignore_torso = ignore;
        return this;
    }

    ignore_head(ignore = true) {
        this._internal.ignore_head = ignore;
        return this;
    }

    // no filter = all objects, filter = only objects with these tags
    include_objects(tag_filter?: string[]) {
        this._internal.objects = {include: true, tag_filter};
        return this;
    }

    exclude_objects() {
        this._internal.objects = {include: false};
        return this;
    }

    exclude_players() {
        this._internal.ignore_head = true;
        this._internal.ignore_torso = true;
        this._internal.ignore_hands = true;

        return this;
    }

    build(): TriggerVolumeInteraction {
        return TriggerVolumeInteractionSchema.parse(this._internal);
    }
}

/** @group Interactions */
export class FollowPlayerInteractionBuilder extends BaseBuilder<FollowPlayerInteractionInput> {
    constructor() {
        super({type: "follow-player"} as FollowPlayerInteractionInput);
    }

    set_enabled(enabled: boolean) {
        this._internal.enabled = enabled;
        return this;
    }

    // if true, disabling follow will make the object obey its position coordinates rather than freezing in place. likely irrelevant for most implementations
    snaps_on_release(snap: boolean = true) {
        this._internal.snap_on_release = snap;
        return this;
    }

    build(): FollowPlayerInteractionInput {
        return FollowPlayerInteractionSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            set_enabled: async (enabled: boolean) => {
                return await interaction_command(object_id, interaction_id, "set_enabled", {enabled});
            }
        }
    }
}

/** @group Interactions */
export class PositionalAudioInteractionBuilder extends BaseBuilder<PositionalAudioInteractionInput> {
    constructor() {
        super({type: "positional-audio"} as PositionalAudioInteractionInput);
    }

    set_url(url: string) {
        this._internal.url = asset_url(url);
        return this;
    }

    set_max_distance(distance: number) {
        this._internal.max_distance = distance;
        return this;
    }

    set_offset(offset: [number, number, number]) {
        this._internal.offset = offset;
        return this;
    }

    loop(loop = true) {
        this._internal.loop = loop;
        return this;
    }

    autoplay(autoplay = true) {
        this._internal.autoplay = autoplay;
        return this;
    }

    build(): PositionalAudioInteraction {
        return PositionalAudioInteractionSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            play: async () => {
                return await interaction_command(object_id, interaction_id, "play");
            },
            pause: async () => {
                return await interaction_command(object_id, interaction_id, "pause");
            },
            stop: async () => {
                return await interaction_command(object_id, interaction_id, "stop");
            },
            seek: async (offset: number) => {
                return await interaction_command(object_id, interaction_id, "seek", {offset});
            },
            is_playing: async () => {
                return await interaction_command(object_id, interaction_id, "is_playing");
            },
            set_loop: async (loop: boolean) => {
                return await interaction_command(object_id, interaction_id, "set_loop", {loop});
            },
            set_max_distance: async (max_distance: number) => {
                return await interaction_command(object_id, interaction_id, "set_max_distance", {max_distance});
            },
            set_offset: async (offset: [number, number, number]) => {
                return await interaction_command(object_id, interaction_id, "set_offset", {offset});
            }
        }
    }
}

/** @group Interactions */
export class GlobalAudioInteractionBuilder extends BaseBuilder<GlobalAudioInteractionInput> {
    constructor() {
        super({type: "global-audio"} as GlobalAudioInteractionInput);
    }

    set_url(url: string) {
        this._internal.url = asset_url(url);
        return this;
    }

    set_volume(volume: number) {
        this._internal.volume = volume;
        return this;
    }

    loop(loop = true) {
        this._internal.loop = loop;
        return this;
    }

    autoplay(autoplay = true) {
        this._internal.autoplay = autoplay;
        return this;
    }

    build(): GlobalAudioInteraction {
        return GlobalAudioInteractionSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            play: async () => {
                return await interaction_command(object_id, interaction_id, "play");
            },
            pause: async () => {
                return await interaction_command(object_id, interaction_id, "pause");
            },
            stop: async () => {
                return await interaction_command(object_id, interaction_id, "stop");
            },
            seek: async (offset: number) => {
                return await interaction_command(object_id, interaction_id, "seek", {offset});
            },
            is_playing: async () => {
                return await interaction_command(object_id, interaction_id, "is_playing");
            },
            set_volume: async (volume: number) => {
                return await interaction_command(object_id, interaction_id, "set_volume", {volume});
            },
            set_loop: async (loop: boolean) => {
                return await interaction_command(object_id, interaction_id, "set_loop", {loop});
            }
        }
    }
}

const base_light_api = (object_id: string, interaction_id: string) => {
    return {
        set_color: async (color: number | string) => {
            return await interaction_command(object_id, interaction_id, "set_color", {color});
        },
        set_intensity: async (intensity: number) => {
            return await interaction_command(object_id, interaction_id, "set_intensity", {intensity});
        },
        set_offset: async (offset: [number, number, number]) => {
            return await interaction_command(object_id, interaction_id, "set_offset", {offset});
        },
        tween_color: async (color: number | string, duration: number, easing: TweenEasing) => {
            return await interaction_command(object_id, interaction_id, "tween_color", {color, duration, easing});
        },
        tween_intensity: async (intensity: number, duration: number, easing: TweenEasing) => {
            return await interaction_command(object_id, interaction_id, "tween_intensity", {intensity, duration, easing});
        },
        tween_offset: async (offset: [number, number, number], duration: number, easing: TweenEasing) => {
            return await interaction_command(object_id, interaction_id, "tween_offset", {offset, duration, easing});
        },
    }
}

/** @group Interactions */
export class PointLightInteractionBuilder extends BaseBuilder<PointLightInteractionInput> {
    constructor() {
        super({type: "point-light"} as PointLightInteractionInput);
    }

    set_color(color: number | string) {
        this._internal.color = color;
        return this;
    }

    set_intensity(intensity: number) {
        this._internal.intensity = intensity;
        return this;
    }

    set_distance(distance: number) {
        this._internal.distance = distance;
        return this;
    }

    set_decay(decay: number) {
        this._internal.decay = decay;
        return this;
    }

    set_offset(offset: [number, number, number]) {
        this._internal.offset = offset;
        return this;
    }

    cast_shadow(cast_shadow = true) {
        this._internal.cast_shadow = cast_shadow;
        return this;
    }

    build(): PointLightInteraction {
        return PointLightInteractionSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            ...base_light_api(object_id, interaction_id),
            set_distance: async (distance: number) => {
                return await interaction_command(object_id, interaction_id, "set_distance", {distance});
            },
            set_decay: async (decay: number) => {
                return await interaction_command(object_id, interaction_id, "set_decay", {decay});
            },
            tween_distance: async (distance: number, duration: number, easing: TweenEasing) => {
                return await interaction_command(object_id, interaction_id, "tween_distance", {distance, duration, easing});
            },
            tween_decay: async (decay: number, duration: number, easing: TweenEasing) => {
                return await interaction_command(object_id, interaction_id, "tween_decay", {decay, duration, easing});
            }
        }
    }
}

/** @group Interactions */
export class DirectionalLightInteractionBuilder extends BaseBuilder<DirectionalLightInteractionInput> {
    constructor() {
        super({type: "directional-light"} as DirectionalLightInteractionInput);
    }

    set_color(color: number | string) {
        this._internal.color = color;
        return this;
    }


    set_intensity(intensity: number) {
        this._internal.intensity = intensity;
        return this;
    }

    set_offset(offset: [number, number, number]) {
        this._internal.offset = offset;
        return this;
    }

    set_rotation(rotation: Rotation) {
        this._internal.rotation = rotation;
        return this;
    }

    set_cast_shadow(cast_shadow: boolean) {
        this._internal.cast_shadow = cast_shadow;
        return this;
    }

    // half-extent (metres) of the orthographic shadow frustum
    set_shadow_area(shadow_area: number) {
        this._internal.shadow_area = shadow_area;
        return this;
    }

    build(): DirectionalLightInteraction {
        return DirectionalLightInteractionSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            ...base_light_api(object_id, interaction_id),
            set_rotation: async (rotation: Rotation) => {
                return await interaction_command(object_id, interaction_id, "set_rotation", {rotation});
            },
            tween_rotation: async (rotation: Rotation, duration: number, easing: TweenEasing) => {
                return await interaction_command(object_id, interaction_id, "tween_rotation", {rotation, duration, easing});
            }
        }
    }
}

/**
 * @group Interactions
 */
export class SpotLightInteractionBuilder extends BaseBuilder<SpotLightInteractionInput> {
    constructor() {
        super({type: "spot-light"} as SpotLightInteractionInput);
    }

    set_color(color: number | string) {
        this._internal.color = color;
        return this;
    }

    set_intensity(intensity: number) {
        this._internal.intensity = intensity;
        return this;
    }

    set_distance(distance: number) {
        this._internal.distance = distance;
        return this;
    }

    set_decay(decay: number) {
        this._internal.decay = decay;
        return this;
    }

    set_angle(angle: number) {
        this._internal.angle = angle;
        return this;
    }

    set_penumbra(penumbra: number) {
        this._internal.penumbra = penumbra;
        return this;
    }

    set_offset(offset: [number, number, number]) {
        this._internal.offset = offset;
        return this;
    }

    set_rotation(rotation: Rotation) {
        this._internal.rotation = rotation;
        return this;
    }

    set_cast_shadow(cast_shadow: boolean) {
        this._internal.cast_shadow = cast_shadow;
        return this;
    }

    build(): SpotLightInteraction {
        return SpotLightInteractionSchema.parse(this._internal);
    }

    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            ...(DirectionalLightInteractionBuilder._make_api(object_id, interaction_id)),
            set_distance: async (distance: number) => {
                return await interaction_command(object_id, interaction_id, "set_distance", {distance});
            },
            set_decay: async (decay: number) => {
                return await interaction_command(object_id, interaction_id, "set_decay", {decay});
            },
            set_angle: async (angle: number) => {
                return await interaction_command(object_id, interaction_id, "set_angle", {angle});
            },
            set_penumbra: async (penumbra: number) => {
                return await interaction_command(object_id, interaction_id, "set_penumbra", {penumbra});
            },
            tween_distance: async (distance: number, duration: number, easing: TweenEasing) => {
                return await interaction_command(object_id, interaction_id, "tween_distance", {distance, duration, easing});
            },
            tween_decay: async (decay: number, duration: number, easing: TweenEasing) => {
                return await interaction_command(object_id, interaction_id, "tween_decay", {decay, duration, easing});
            },
            tween_angle: async (angle: number, duration: number, easing: TweenEasing) => {
                return await interaction_command(object_id, interaction_id, "tween_angle", {angle, duration, easing});
            },
            tween_penumbra: async (penumbra: number, duration: number, easing: TweenEasing) => {
                return await interaction_command(object_id, interaction_id, "tween_penumbra", {penumbra, duration, easing});
            }
        }
    }
}


/** @group Command APIs */
export interface ParticleEmitterInteractionAPI {
    play: () => Promise<void>;
    pause: () => Promise<void>;
    stop: (hard?: boolean) => Promise<void>;
    restart: () => Promise<void>;
}

/** @group Interactions
 *
 * @bindable api=ParticleEmitterInteractionAPI
 */
export class ParticleEmitterInteractionBuilder extends BaseBuilder<ParticleEmitterInteractionInput> {
    constructor() {
        super({type: "particle-emitter"} as ParticleEmitterInteractionInput);
    }

    set_duration(seconds: number) {
        this._internal.duration = seconds;
        return this;
    }

    loop(loop = true) {
        this._internal.loop = loop;
        return this;
    }

    autoplay(autoplay = true) {
        this._internal.autoplay = autoplay;
        return this;
    }

    set_lifetime(lifetime: ParticleEmitterRandomisableValueInput) {
        this._internal.lifetime = ParticleEmitterRandomisableValueSchema.parse(lifetime);
        return this;
    }

    set_speed(speed: ParticleEmitterRandomisableValueInput) {
        this._internal.speed = ParticleEmitterRandomisableValueSchema.parse(speed);
        return this;
    }

    set_particle_size(size: ParticleEmitterRandomisableValueInput) {
        this._internal.particle_size = ParticleEmitterRandomisableValueSchema.parse(size);
        return this;
    }

    set_particle_rotation(rotation: ParticleEmitterRandomisableValueInput) {
        this._internal.particle_rotation = ParticleEmitterRandomisableValueSchema.parse(rotation);
        return this;
    }

    // single hex, array of equally weighted full alpha hexes, or array of {color, alpha?, weight?} objects
    set_color(color: ParticleEmitterColorInput) {
        this._internal.color = ParticleEmitterColorSchema.parse(color);
        return this;
    }

    set_per_second(per_second: ParticleEmitterRandomisableValueInput) {
        this._internal.per_second = ParticleEmitterRandomisableValueSchema.parse(per_second);
        return this;
    }

    set_emitter_shape(shape: ParticleEmitterShapeInput) {
        this._internal.emitter_shape = ParticleEmitterShapeSchema.parse(shape);
        return this;
    }

    set_visual(visual: ParticleEmitterVisualInput) {
        if (visual.type === "image" || visual.type === "atlas") {
            visual.url = asset_url(visual.url);
        }

        this._internal.visual = ParticleEmitterVisualSchema.parse(visual);
        return this;
    }

    set_behaviors(behaviors: ParticleEmitterBehaviorInput[]) {
        this._internal.behaviors = behaviors.map(behavior => ParticleEmitterBehaviorSchema.parse(behavior));
        return this;
    }

    // TODO: should any of the above be converted to their own builders? probably will want behaviours to be sep builders when more addedf

    follow_emitter(follow = true) {
        this._internal.world_space = !follow;
        return this;
    }

    set_offset(offset: [number, number, number]) {
        this._internal.offset = offset;
        return this;
    }

    set_rotation(rotation: Rotation) {
        this._internal.rotation = RotationSchema.parse(rotation);
        return this;
    }

    set_scale(scale: [number, number, number]) {
        this._internal.scale = scale;
        return this;
    }

    set_world_space(world_space: boolean) {
        this._internal.world_space = world_space;
        return this;
    }

    build(): ParticleEmitterInteraction {
        return ParticleEmitterInteractionSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string): ParticleEmitterInteractionAPI {
        return {
            play: async () => {
                return await interaction_command(object_id, interaction_id, "play");
            },
            pause: async () => {
                return await interaction_command(object_id, interaction_id, "pause");
            },
            stop: async (hard = false) => {
                return await interaction_command(object_id, interaction_id, "stop", {hard});
            },
            restart: async () => {
                return await interaction_command(object_id, interaction_id, "restart");
            },
        }
    }
}

/** @group Interactions */
export class SeatInteractionBuilder extends BaseBuilder<SeatInteractionInput> {
    constructor() {
        super({type: "seat"} as SeatInteractionInput);
    }

    set_anchor_offset(offset: [number, number, number]) {
        this._internal.anchor_offset = offset;
        return this;
    }

    set_facing(facing: Rotation) {
        this._internal.facing = RotationSchema.parse(facing);
        return this;
    }

    set_yaw_range(deg_range: [number, number] | undefined) {
        this._internal.yaw_range_deg = deg_range;
        return this;
    }

    reports_sit(sitting = true) {
        this._internal.report_sit = sitting;
        return this;
    }

    reports_stand(standing = true) {
        this._internal.report_stand = standing;
        return this;
    }

    build(): SeatInteraction {
        return SeatInteractionSchema.parse(this._internal);
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            sit: async (player: Player) => {
                return await interaction_command(object_id, interaction_id, "sit", {username: await player.get_username()});
            },
            stand: async (player: Player) => {
                return await interaction_command(object_id, interaction_id, "stand", {username: await player.get_username()});
            },
        }
    }
}

// mutually exclusive calls like collider has, rather than separate builders for each type
/**
 * @group Interactions
 * @category Raycasts
 */
export class RaycastAimBuilder extends BaseBuilder<RaycastAimInput> {
    constructor() {
        super({type: "direction"} as RaycastAimInput);
    }

    direction(
        direction: [number, number, number],
        distance?: number,
        space: RaycastSpace = "local"
    ) {
        this._internal = {type: "direction", direction, space, distance};
        return this;
    }

    // applied to the object's forward, so [0, 0, 0] casts straight ahead
    rotation(rotation: Rotation, distance?: number) {
        this._internal = {
            type: "rotation",
            rotation: RotationSchema.parse(rotation),
            distance
        };
        return this;
    }
    endpoint(point: [number, number, number], space: RaycastSpace = "local") {
        this._internal = {type: "endpoint", point, space};
        return this;
    }

    // overshoot > 0 keeps casting past the target, so a blocked line of sight is distinguishable from a clear one
    at_object(object_id: string, overshoot?: number) {
        this._internal = {type: "object", object_id, overshoot};
        return this;
    }

    build(): RaycastAim {
        return RaycastAimSchema.parse(this._internal);
    }
}

// TODO: trigger volumes want most of this too (eg tag and object id exclusion), so maybe a shared base class for raycast and trigger volume targets

/**
 * @group Interactions
 * @category Raycasts
 */
export class RaycastTargetsBuilder extends BaseBuilder<RaycastTargetsInput> {
    constructor() {
        super({});
    }

    casts_against(mode: "physics" | "visual") {
        this._internal.against = mode;
        return this;
    }

    include_sensors(include = true) {
        this._internal.include_sensors = include;
        return this;
    }

    include_self(include = true) {
        this._internal.include_self = include;
        return this;
    }

    include_players(options?: {
        ignore_hands?: boolean;
        ignore_head?: boolean;
        ignore_torso?: boolean;
    }) {
        this._internal.players = {include: true, ...options};
        return this;
    }

    exclude_players() {
        this._internal.players = {include: false};
        return this;
    }

    // no filter = all objects, filter = only objects carrying one of these tags
    include_objects(tag_filter?: string[]) {
        this._internal.objects = {...this._internal.objects, include: true, tag_filter};
        return this;
    }

    exclude_objects() {
        this._internal.objects = {...this._internal.objects, include: false};
        return this;
    }

    exclude_tags(tags: string[]) {
        this._internal.objects = {...this._internal.objects, exclude_tags: tags};
        return this;
    }

    exclude_object_ids(object_ids: string[]) {
        this._internal.objects = {...this._internal.objects, exclude_object_ids: object_ids};
        return this;
    }

    // by default a filtered-out wall still stops the ray and you get a miss
    // pass-through makes the ray ignore non-targets entirely and keep going
    pass_through_non_targets(pass = true) {
        this._internal.non_targets = pass ? "pass-through" : "block";
        return this;
    }

    // > 1 keeps going after a valid hit and reports each one in order
    pierce(max_hits: number) {
        if (!Number.isInteger(max_hits) || max_hits < 1) {
            throw new Error("max_hits must be a positive integer.");
        }
        this._internal.max_hits = max_hits;
        return this;
    }

    build(): RaycastTargets {
        return RaycastTargetsSchema.parse(this._internal);
    }
}

/**
 * @group Interactions
 * @category Raycasts
 */
export class RaycastFiringBuilder extends BaseBuilder<RaycastFiringInput> {
    constructor() {
        super({type: "manual"} as RaycastFiringInput);
    }

    // only fires when the sdk calls fire()
    manual() {
        this._internal = {type: "manual"};
        return this;
    }

    continuous(options?: {
        interval_ms?: number;
        ignore_unchanged?: boolean;
        min_change_delta?: number;
    }) {
        this._internal = {type: "continuous", ...options};
        return this;
    }

    // flat LMB / vr trigger, handled engine-side so there is no round trip per shot
    on_use(options?: {require_held?: boolean; cooldown_ms?: number}) {
        this._internal = {type: "on-use", ...options};
        return this;
    }

    build(): RaycastFiring {
        return RaycastFiringSchema.parse(this._internal);
    }
}

/**
 * @group Interactions
 * @category Raycasts
 */
export class RaycastRaysBuilder extends BaseBuilder<RaycastRaysInput> {
    constructor() {
        super({});
    }

    // spreads count rays evenly within angle_deg of the aim direction
    cone(count: number, angle_deg: number) {
        this._internal = {...this._internal, count, pattern: "cone", angle_deg};
        return this;
    }

    // puts every ray on the edge of the cone instead of filling it
    ring(count: number, angle_deg: number) {
        this._internal = {...this._internal, count, pattern: "ring", angle_deg};
        return this;
    }

    set_jitter(jitter_deg: number) {
        this._internal.jitter_deg = jitter_deg;
        return this;
    }

    // seeding makes the pattern replay identically, which the multiplayer swap will need so pellet directions agree across peers
    set_seed(seed: number) {
        this._internal.seed = seed;
        return this;
    }

    build(): RaycastRays {
        return RaycastRaysSchema.parse(this._internal);
    }
}

/**
 * @group Interactions
 * @category Raycasts
 */
export class RaycastInteractionBuilder extends BaseBuilder<RaycastInteractionInput> {
    constructor() {
        super({type: "raycast"} as RaycastInteractionInput);
    }

    set_enabled(enabled: boolean) {
        this._internal.enabled = enabled;
        return this;
    }

    set_origin_offset(offset: [number, number, number]) {
        this._internal.origin = {...this._internal.origin, offset};
        return this;
    }

    set_origin_rotation(rotation: Rotation) {
        this._internal.origin = {
            ...this._internal.origin,
            rotation: RotationSchema.parse(rotation)
        };
        return this;
    }

    set_aim(aim: RaycastAim) {
        this._internal.aim = aim;
        return this;
    }

    set_targets(targets: RaycastTargets) {
        this._internal.targets = targets;
        return this;
    }

    set_firing(firing: RaycastFiring) {
        this._internal.firing = firing;
        return this;
    }

    set_rays(rays: RaycastRays) {
        this._internal.rays = rays;
        return this;
    }

    // 0 is a true ray, > 0 sphere-casts instead for forgiving aim
    set_thickness(thickness: number) {
        this._internal.thickness = thickness;
        return this;
    }

    set_min_distance(min_distance: number) {
        this._internal.min_distance = min_distance;
        return this;
    }

    set_reports_hits(reports: boolean) {
        this._internal.report_hits = reports;
        return this;
    }

    reports_misses(reports = true) {
        this._internal.report_misses = reports;
        return this;
    }

    // enter/exit style, fires when the thing being hit changes
    reports_target_changes(reports = true) {
        this._internal.report_target_changes = reports;
        return this;
    }

    build(): RaycastInteraction {
        const built = RaycastInteractionSchema.parse(this._internal);

        if (built.thickness > 0 && built.rays.count > 1) {
            console.warn(
                "Raycast has both thickness and multiple rays. Prefer either thickness for a single forgiving ray, or rays for countable pellets."
            );
        }

        if (built.firing.type === "manual" && built.report_target_changes) {
            console.warn(
                "report_target_changes on a manual raycast only fires when consecutive fire() calls hit different things, which is rarely what is wanted."
            );
        }

        return built;
    }


    /** @internal */
    static _make_api(object_id: string, interaction_id: string) {
        return {
            fire: async (options?: {extra_spread_deg?: number}): Promise<RaycastResult> => {
                return await interaction_command(object_id, interaction_id, "fire", options);
            },
            set_enabled: async (enabled: boolean) => {
                return await interaction_command(object_id, interaction_id, "set_enabled", {enabled});
            },
            set_aim: async (aim: RaycastAim) => {
                return await interaction_command(object_id, interaction_id, "set_aim", {aim});
            },
            set_targets: async (targets: RaycastTargets) => {
                return await interaction_command(object_id, interaction_id, "set_targets", {targets});
            },
            set_rays: async (rays: RaycastRays) => {
                return await interaction_command(object_id, interaction_id, "set_rays", {rays});
            },
            set_thickness: async (thickness: number) => {
                return await interaction_command(object_id, interaction_id, "set_thickness", {thickness});
            },
            set_min_distance: async (min_distance: number) => {
                return await interaction_command(object_id, interaction_id, "set_min_distance", {min_distance});
            },
        };
    }
}

/** @internal **/
export const _INTERACTION_API_MAKERS = {
    "follow-player": FollowPlayerInteractionBuilder._make_api,
    "positional-audio": PositionalAudioInteractionBuilder._make_api,
    "global-audio": GlobalAudioInteractionBuilder._make_api,
    "point-light": PointLightInteractionBuilder._make_api,
    "directional-light": DirectionalLightInteractionBuilder._make_api,
    "spot-light": SpotLightInteractionBuilder._make_api,
    "particle-emitter": ParticleEmitterInteractionBuilder._make_api,
    "seat": SeatInteractionBuilder._make_api,
    "raycast": RaycastInteractionBuilder._make_api
} as Record<string, InteractionMakeAPIFunc>;
