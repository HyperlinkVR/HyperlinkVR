import {BaseBuilder} from "./base";
import type {
    WorldEnv,
    WorldEnvInput,
    WorldFog,
    WorldSky} from "@hyperlinkvr/vr-engine-schemas";
import {
    WorldEnvSchema,
    WorldFogSchema,
    WorldSkySchema
} from "@hyperlinkvr/vr-engine-schemas";
import {send_via_rtc} from "../messenger";

export class WorldSkyBuilder extends BaseBuilder<WorldSky> {
    constructor() {
        super({});
    }

    set_sky_zenith_color(color: number | string) {
        this._internal.sky_zenith_color = color;
        return this;
    }

    set_sky_horizon_color(color: number | string) {
        this._internal.sky_horizon_color = color;
        return this;
    }

    set_ground_horizon_color(color: number | string) {
        this._internal.ground_horizon_color = color;
        return this;
    }

    set_ground_nadir_color(color: number | string) {
        this._internal.ground_nadir_color = color;
        return this;
    }

    set_sun_direction(dir: [number, number, number]) {
        this._internal.sun_direction = dir;
        return this;
    }

    set_sun_color(color: number | string) {
        this._internal.sun_color = color;
        return this;
    }

    set_sun_intensity(intensity: number) {
        this._internal.sun_intensity = intensity;
        return this;
    }

    set_sun_size(size: number) {
        this._internal.sun_size = size;
        return this;
    }

    set_sun_glow(glow: number) {
        this._internal.sun_glow = glow;
        return this;
    }

    set_horizon_sharpness(sharpness: number) {
        this._internal.horizon_sharpness = sharpness;
        return this;
    }

    set_horizon_band(band: number) {
        this._internal.horizon_band = band;
        return this;
    }

    set_cast_light(cast: boolean) {
        this._internal.cast_light = cast;
        return this;
    }

    set_light_intensity(intensity: number) {
        this._internal.light_intensity = intensity;
        return this;
    }

    set_light_distance(distance: number) {
        this._internal.light_distance = distance;
        return this;
    }

    set_sky_light_intensity(intensity: number) {
        this._internal.sky_light_intensity = intensity;
        return this;
    }

    set_ambient_override_color(color: number | string | undefined) {
        this._internal.ambient_override_color = color;
        return this;
    }

    set_ambient_override_intensity(intensity: number) {
        this._internal.ambient_override_intensity = intensity;
        return this;
    }

    build(): WorldSky {
        return WorldSkySchema.parse(this._internal);
    }
}

export class WorldFogBuilder extends BaseBuilder<WorldFog> {
    constructor() {
        super({});
    }

    set_color(color: number | string) {
        this._internal.color = color;
        return this;
    }

    set_near(near: number) {
        this._internal.near = near;
        return this;
    }

    set_far(far: number) {
        this._internal.far = far;
        return this;
    }

    build(): WorldFog {
        return WorldFogSchema.parse(this._internal);
    }
}

// note that all fields are optional and the env is applied differentially. use static reset to default and grayspace funcs to reset the env to a known state
// (when your world starts, the env is automatically set to default)
export class WorldEnvBuilder extends BaseBuilder<WorldEnvInput> {
    constructor() {
        super({});
    }

    set_sky(sky: WorldSky) {
        this._internal.sky = sky;
        return this;
    }

    set_fog(fog: WorldFog) {
        this._internal.fog = fog;
        return this;
    }

    set_gravity(gravity: number) {
        if (!this._internal.physics) {
            this._internal.physics = {};
        }
        this._internal.physics.gravity = gravity;
        return this;
    }

    build(): WorldEnv {
        return WorldEnvSchema.parse(this._internal);
    }

    async apply() {
        const env = this.build();
        const res = await send_via_rtc({
            action: "HVRSDK_UPDATE_WORLD_ENV",
            env
        });

        if (!res || !res.success) {
            throw new Error("Failed to apply world environment");
        }
    }

    static async reset_to_default() {
        const res = await send_via_rtc({
            action: "HVRSDK_RESET_WORLD_ENV",
            type: "default"
        });

        if (!res || !res.success) {
            throw new Error("Failed to reset world environment to default");
        }
    }

    static async reset_to_grayspace() {
        const res = await send_via_rtc({
            action: "HVRSDK_RESET_WORLD_ENV",
            type: "grayspace"
        });

        if (!res || !res.success) {
            throw new Error("Failed to reset world environment to grayspace");
        }
    }
}
