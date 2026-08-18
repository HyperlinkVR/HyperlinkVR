import {useCallback, useMemo} from "react";
import {
    HexColor, ParticleEmitterBehavior,
    ParticleEmitterColor, ParticleEmitterInteraction,
    ParticleEmitterRandomisableValue,
    ParticleEmitterShape, ParticleEmitterVisual
} from "@hyperlinkvr/vr-engine-schemas";
import {FlexibleColor, ParticleSystem, ParticleSystemRef} from "quarks.r3f";
import {ColorGenerator, ConeEmitter, PointEmitter, SphereEmitter, EmitterMode, GravityForce, ApplyForce, Vector3, ConstantValue, RenderMode} from "three.quarks";
import {
    BufferGeometry,
    DoubleSide,
    Euler,
    Material,
    MeshBasicMaterial,
    PlaneGeometry,
    TextureLoader
} from "three";
import {rotation_to_euler} from "../util/rotation";
import {useAssetURL} from "../hooks/useAssetURL";

export const ParticleEmitter = ({config, ref = null}: {config: Omit<ParticleEmitterInteraction, "type">, ref?: React.Ref<ParticleSystemRef | null>}) => {
    const convert_randomisable_value = useCallback(
        (value?: ParticleEmitterRandomisableValue) => {
            if (value === undefined || typeof value === "number") {
                return value;
            } else {
                return [value.min, value.max] as [number, number];
            }
        },
        []
    );

    const color_to_rgba = useCallback(
        (color: HexColor, alpha = 1): {r: number, g: number, b: number, a: number} => {
            const hex = color.toString(16).padStart(6, "0");
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            return {r, g, b, a: alpha};
        },
        []
    );

    const generate_color_value = useCallback(
        (color?: ParticleEmitterColor): FlexibleColor | undefined => {
            // a straight color (number or string) is just returned converted to rgba
            if (color === undefined || typeof color === "number" || typeof color === "string") {
                return color_to_rgba(color as HexColor);
            }

            // they can give either an array of colors, or an array of objects {color, alpha, weight} which a generator should be returned for
            const weighted_colors = new Map<HexColor, {weight: number, alpha: number}>();

            if (Array.isArray(color)) {
                if (typeof color[0] === "number" || typeof color[0] === "string") {
                    // they must all have no props, add them all with equal weight and full alpha
                    for (const c of color) {
                        weighted_colors.set(c as HexColor, {weight: 1, alpha: 1});
                    }
                } else {
                    // they must all have props
                    for (const c of (color as {color: HexColor, weight?: number, alpha?: number}[])) {
                        weighted_colors.set(c.color, {weight: c.weight ?? 1, alpha: c.alpha ?? 1});
                    }
                }

                // create a generator and return it
                const total_weight = Array.from(weighted_colors.values()).reduce((a, b) => a + b.weight, 0);
                const func = () => {
                    const rand = Math.random() * total_weight;
                    let cumulative_weight = 0;
                    for (const [color, props] of weighted_colors.entries()) {
                        cumulative_weight += props.weight;
                        if (rand <= cumulative_weight) {
                            return color_to_rgba(color, props.alpha);
                        }
                    }

                    // should never get here
                    throw new Error("Failed to generate color");
                }

                const generator = {
                    type: "value",
                    startGen: () => {},
                    genColor: (memory, color) => {
                        const c = func();
                        color.set(c.r, c.g, c.b, c.a);
                        return color;
                    },
                    toJSON: () => {
                        return {
                            type: "RandomColor",
                            colors: Array.from(weighted_colors.entries()).map(([color, weight]) => ({color, weight}))
                        };
                    },
                    clone: () => {
                        return generator;
                    }
                } as ColorGenerator;

                return generator;
            } else {
                throw new Error("Invalid color value");
            }
        },
        []
    );

    const instance_shape = useCallback(
        (shape?: ParticleEmitterShape) => {
            if (!shape) {
                return undefined;
            }

            const modes = {
                "random": EmitterMode.Random,
                "loop": EmitterMode.Loop,
                "ping-pong": EmitterMode.PingPong,
                "burst": EmitterMode.Burst,
            };

            switch (shape.type) {
                case "point":
                    return new PointEmitter();
                case "sphere":
                    return new SphereEmitter({radius: shape.radius, thickness: shape.thickness, mode: shape.mode ? modes[shape.mode] : EmitterMode.Random});
                case "cone":
                    return new ConeEmitter({radius: shape.radius, angle: shape.angle, arc: shape.arc, mode: shape.mode ? modes[shape.mode] : EmitterMode.Random});
            }
        },
        []
    );

    const instance_visual = useCallback(
        (visual?: ParticleEmitterVisual, maybe_particle_image_url?: string): {
            material?: Material,
            geometry?: BufferGeometry,
            render_mode: RenderMode,
        } => {
            if (!visual) {
                return {render_mode: RenderMode.BillBoard};
            }

            switch (visual.type) {
                case "image": {
                    if (maybe_particle_image_url === undefined) {
                        return {render_mode: RenderMode.BillBoard};
                    }

                    if (maybe_particle_image_url === null) {
                        throw new Error("Failed to load particle image from asset ref");
                    }

                    const texture = new TextureLoader().load(maybe_particle_image_url);
                    return {
                        material: new MeshBasicMaterial({
                            map: texture,
                            transparent: visual.alpha !== 1,
                            opacity: visual.alpha
                        }),
                        render_mode: RenderMode.BillBoard
                    };
                }
                case "quad": {
                    return {
                        material: new MeshBasicMaterial({
                            color: visual.color,
                            side: DoubleSide,
                            transparent: visual.alpha !== 1,
                            opacity: visual.alpha
                        }),
                        geometry: new PlaneGeometry(visual.width, visual.height),
                        render_mode: RenderMode.Mesh
                    };
                }
            }
        },
        []
    );

    const instance_behaviors = useCallback(
        (behaviors?: ParticleEmitterBehavior[])=> {
            if (!behaviors) {
                return undefined;
            }

            return behaviors.map((behavior) => {
                switch (behavior.type) {
                    case "gravity": {
                        if (behavior.origin) {
                            // attract towards the point
                            const origin_vec3 = new Vector3(...behavior.origin);
                            return new GravityForce(origin_vec3, behavior.magnitude ?? 9.81);
                        }

                        // no origin is plain downward gravity
                        return new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(behavior.magnitude ?? 9.81));
                    }
                }
            });
        },
        []
    );

    const lifetime = useMemo(() => convert_randomisable_value(config.lifetime), [config.lifetime, convert_randomisable_value]);
    const speed = useMemo(() => convert_randomisable_value(config.speed), [config.speed, convert_randomisable_value]);
    const particle_size = useMemo(() => convert_randomisable_value(config.particle_size), [config.particle_size, convert_randomisable_value]);
    const particle_rotation = useMemo(() => convert_randomisable_value(config.particle_rotation), [config.particle_rotation, convert_randomisable_value]);
    const per_second = useMemo(() => convert_randomisable_value(config.per_second), [config.per_second, convert_randomisable_value]);
    const color = useMemo(() => generate_color_value(config.color), [config.color, generate_color_value]);
    const emitter_shape = useMemo(() => instance_shape(config.emitter_shape), [config.emitter_shape, instance_shape]);

    const maybe_particle_image_url = useAssetURL(
        config.visual?.type === "image" ? config.visual.url : undefined
    );
    const visual = useMemo(() => instance_visual(config.visual, maybe_particle_image_url || undefined), [config.visual, maybe_particle_image_url, instance_visual]);
    const material = useMemo(() => visual.material, [visual]);

    const geometry = useMemo(() => visual.geometry, [visual]);
    const render_mode = useMemo(() => visual.render_mode, [visual]);
    const behaviors = useMemo(() => instance_behaviors(config.behaviors), [config.behaviors, instance_behaviors]);

    const euler_rot = useMemo(() => {
        if (!config.rotation) {
            return [0, 0, 0] as [number, number, number];
        }

        const euler = new Euler();
        rotation_to_euler(config.rotation, euler);
        return [euler.x, euler.y, euler.z] as [number, number, number];
    }, [config.rotation]);

    return (
        <ParticleSystem
                ref={ref}
                duration={config.duration}
                looping={config.loop}
                autoPlay={config.autoplay}
                startLife={lifetime}
                startSpeed={speed}
                startSize={particle_size}
                startColor={color}
                startRotation={particle_rotation}
                emissionOverTime={per_second}
                shape={emitter_shape}
                material={material}
                instancingGeometry={geometry}
                renderMode={render_mode}
                behaviors={behaviors}
                worldSpace={config.world_space}
                position={config.offset}
                rotation={euler_rot}
                scale={config.scale}
        />
    );
}
