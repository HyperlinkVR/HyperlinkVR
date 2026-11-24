import { z } from "zod";

const ColorSchema = z.union([z.string(), z.number()]);
type ColorRep = z.infer<typeof ColorSchema>;

export const WorldSkySchema = z.object({
    sky_zenith_color: ColorSchema.optional(),
    sky_horizon_color: ColorSchema.optional(),

    ground_horizon_color: ColorSchema.optional(),
    ground_nadir_color: ColorSchema.optional(),

    sun_direction: z.tuple([z.number(), z.number(), z.number()]).optional(),
    sun_color: ColorSchema.optional(),
    sun_intensity: z.number().optional(),
    sun_size: z.number().optional(),
    sun_glow: z.number().optional(),

    // tightness of the gradient transition of the sky. 1 is linear, >1 is more spread, <1 is more abrupt
    horizon_sharpness: z.number().optional(),

    // tightness of blend between ground and sky at the horizon seam. 0 is abrupt, >0 is more spread
    horizon_band: z.number().optional(),

    // whether to emit a point light from the sun
    cast_light: z.boolean().optional(),
    light_intensity: z.number().optional(),
    light_distance: z.number().optional(),

    sky_light_intensity: z.number().optional(),

    ambient_override_color: ColorSchema.optional(),
    ambient_override_intensity: z.number().optional(),
});
export type WorldSky = z.infer<typeof WorldSkySchema>;

export const WorldFogSchema = z.object({
    color: ColorSchema.optional(),
    near: z.number().optional(),
    far: z.number().optional(),
});
export type WorldFog = z.infer<typeof WorldFogSchema>;

export const WorldPhysicsSchema = z.object({
    gravity: z.number().default(-9.81),
    // shared worlds: whether players block each other's movement (their bodies collide with each
    // other's). off by default, so players walk through one another
    player_collisions: z.boolean().default(false)
});
export type WorldPhysics = z.infer<typeof WorldPhysicsSchema>;
export type WorldPhysicsInput = z.input<typeof WorldPhysicsSchema>;

export const WorldEnvSchema = z.object({
    sky: WorldSkySchema.optional(),
    fog: WorldFogSchema.optional(),
    physics: WorldPhysicsSchema.optional(),
});
export type WorldEnv = z.infer<typeof WorldEnvSchema>;
export type WorldEnvInput = z.input<typeof WorldEnvSchema>;
export type WorldEnvRequired = Required<WorldEnv>;
export type WorldEnvFull = {
    sky: Required<Omit<WorldSky, "ambient_override_color">> & {ambient_override_color?: ColorRep};
    fog: Required<WorldFog>;
    physics: Required<WorldPhysics>;
};
