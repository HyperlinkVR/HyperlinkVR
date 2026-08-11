import {BaseBuilder} from "./base";
import {
    Collider,
    DirectionalLightInteraction,
    DirectionalLightInteractionInput,
    DirectionalLightInteractionSchema,
    FollowPlayerInteractionInput,
    FollowPlayerInteractionSchema,
    GlobalAudioInteraction,
    GlobalAudioInteractionInput,
    GlobalAudioInteractionSchema,
    GrabbableInteraction,
    GrabbableInteractionInput,
    GrabbableInteractionSchema,
    GrabCollider,
    GrabOffsetInput, ParticleEmitterBehaviorInput, ParticleEmitterBehaviorSchema,
    ParticleEmitterColorInput, ParticleEmitterColorSchema, ParticleEmitterInteraction,
    ParticleEmitterInteractionInput, ParticleEmitterInteractionSchema,
    ParticleEmitterRandomisableValueInput,
    ParticleEmitterRandomisableValueSchema, ParticleEmitterShapeInput,
    ParticleEmitterShapeSchema, ParticleEmitterVisualInput, ParticleEmitterVisualSchema,
    PointLightInteraction,
    PointLightInteractionInput,
    PointLightInteractionSchema,
    PositionalAudioInteraction,
    PositionalAudioInteractionInput,
    PositionalAudioInteractionSchema,
    Rotation, RotationSchema, SeatInteraction, SeatInteractionInput, SeatInteractionSchema,
    SpotLightInteraction,
    SpotLightInteractionInput,
    SpotLightInteractionSchema,
    TriggerVolumeInteraction,
    TriggerVolumeInteractionInput,
    TriggerVolumeInteractionSchema,
    TweenEasing
} from "@hyperlinkvr/vr-engine-schemas";
import {send_via_rtc} from "../messenger";
import {Player} from "../players";

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

export type InteractionMakeAPIFunc = (object_id: string, interaction_id: string) => any;

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

export class TriggerVolumeInteractionBuilder extends BaseBuilder<TriggerVolumeInteractionInput> {
    constructor() {
        super({type: "trigger-volume"} as TriggerVolumeInteractionInput);
    }

    set_collider(collider: Collider) {
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

    build(): TriggerVolumeInteraction {
        return TriggerVolumeInteractionSchema.parse(this._internal);
    }
}

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


    static _make_api(object_id: string, interaction_id: string) {
        return {
            set_enabled: async (enabled: boolean) => {
                return await interaction_command(object_id, interaction_id, "set_enabled", {enabled});
            }
        }
    }
}

export class PositionalAudioInteractionBuilder extends BaseBuilder<PositionalAudioInteractionInput> {
    constructor() {
        super({type: "positional-audio"} as PositionalAudioInteractionInput);
    }

    set_url(url: string) {
        this._internal.url = url;
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

export class GlobalAudioInteractionBuilder extends BaseBuilder<GlobalAudioInteractionInput> {
    constructor() {
        super({type: "global-audio"} as GlobalAudioInteractionInput);
    }

    set_url(url: string) {
        this._internal.url = url;
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

    build(): PointLightInteraction {
        return PointLightInteractionSchema.parse(this._internal);
    }


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

    build(): DirectionalLightInteraction {
        return DirectionalLightInteractionSchema.parse(this._internal);
    }


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

    build(): SpotLightInteraction {
        return SpotLightInteractionSchema.parse(this._internal);
    }

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

    build(): ParticleEmitterInteraction {
        return ParticleEmitterInteractionSchema.parse(this._internal);
    }


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
            restart: async () => {
                return await interaction_command(object_id, interaction_id, "restart");
            },
        }
    }
}

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

export const _INTERACTION_API_MAKERS = {
    "follow-player": FollowPlayerInteractionBuilder._make_api,
    "positional-audio": PositionalAudioInteractionBuilder._make_api,
    "global-audio": GlobalAudioInteractionBuilder._make_api,
    "point-light": PointLightInteractionBuilder._make_api,
    "directional-light": DirectionalLightInteractionBuilder._make_api,
    "spot-light": SpotLightInteractionBuilder._make_api,
    "particle-emitter": ParticleEmitterInteractionBuilder._make_api,
    "seat": SeatInteractionBuilder._make_api,
} as Record<string, InteractionMakeAPIFunc>;
