import type {
    Interacted,
    RaycastAim, RaycastHit,
    RaycastInteraction,
    RaycastRays, RaycastResult,
    RaycastTargets
} from "@hyperlinkvr/vr-engine-schemas";
import { useFrame, useThree } from "@react-three/fiber";
import { useAfterPhysicsStep, useRapier, type RapierCollider } from "@react-three/rapier";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Group, Object3D} from "three";
import { MathUtils, Quaternion, Raycaster, Vector3 } from "three";

import { useSessionMode } from "../../../react/src/contexts/SessionMode";
import { useFlatFrameInput } from "../input/impl/flat/bindings";
import { useHands } from "../input/hands";
import { get_object_refs } from "../engine/object_ref_registry";
import { sample_live_transform } from "../engine/object_modification";
import { rotation_to_quaternion } from "../util/rotation";
import {
    resolve_hit_target,
    resolve_object_node,
    target_key
} from "./util/target_resolution";
import { get_object_holder } from "./util/holders";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FORWARD = new Vector3(0, 0, -1);
const WORLD_UP = new Vector3(0, 1, 0);

// scratch. fire() is synchronous and never reentrant, so module-level is safe
// and keeps a continuous cast from allocating every frame
const scratch_origin = new Vector3();
const scratch_origin_quat = new Quaternion();
const scratch_forward = new Vector3();
const scratch_right = new Vector3();
const scratch_up = new Vector3();
const scratch_direction = new Vector3();
const scratch_point = new Vector3();
const scratch_aim_quat = new Quaternion();
const scratch_lateral = new Vector3();
const scratch_cast_origin = new Vector3();

// deterministic rng so a seeded pattern replays identically. matters for the
// multiplayer swap later, where pellet directions have to agree across peers
const make_rng = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

// forward is not necessarily the origin's forward (endpoint and object aim
// point wherever they like), so orthonormalise the origin's axes against it
const build_basis = (forward: Vector3, origin_quat: Quaternion) => {
    scratch_right.set(1, 0, 0).applyQuaternion(origin_quat);
    scratch_right.addScaledVector(forward, -scratch_right.dot(forward));

    if (scratch_right.lengthSq() < 1e-6) {
        scratch_right.copy(WORLD_UP).cross(forward);
        if (scratch_right.lengthSq() < 1e-6) scratch_right.set(1, 0, 0);
    }

    scratch_right.normalize();
    scratch_up.copy(forward).cross(scratch_right).normalize();
};

interface ResolvedRay {
    distance: number;
}

// writes the world direction into scratch_forward, returns the max distance,
// or null when the aim cannot be resolved this tick (a target that despawned)
const resolve_aim = (aim: RaycastAim, origin_node: Object3D): ResolvedRay | null => {
    if (aim.type === "direction") {
        scratch_forward.set(aim.direction[0], aim.direction[1], aim.direction[2]);
        if (scratch_forward.lengthSq() < 1e-8) return null;

        // a local direction tilts with the origin's own rotation, so a barrel
        // offset aims where the barrel points
        if (aim.space === "local") scratch_forward.applyQuaternion(scratch_origin_quat);
        scratch_forward.normalize();
        return { distance: aim.distance };
    }

    if (aim.type === "rotation") {
        rotation_to_quaternion(aim.rotation, scratch_aim_quat);
        scratch_aim_quat.premultiply(scratch_origin_quat);
        scratch_forward.copy(FORWARD).applyQuaternion(scratch_aim_quat).normalize();
        return { distance: aim.distance };
    }

    if (aim.type === "endpoint") {
        scratch_point.set(aim.point[0], aim.point[1], aim.point[2]);

        if (aim.space === "local") {
            // the anchor's parent is the object's own space, so the endpoint
            // ignores the origin's rotation and reads as an object-space point
            const space_node = origin_node.parent ?? origin_node;
            space_node.localToWorld(scratch_point);
        }

        scratch_forward.copy(scratch_point).sub(scratch_origin);
        const distance = scratch_forward.length();
        if (distance < 1e-6) return null;

        scratch_forward.divideScalar(distance);
        return { distance };
    }

    // object aim: sample the target's live pose each cast so it tracks
    const target_refs = get_object_refs(aim.object_id)?.current;
    if (!target_refs) return null;

    const transform = sample_live_transform(target_refs);
    scratch_point.set(transform.position[0], transform.position[1], transform.position[2]);

    scratch_forward.copy(scratch_point).sub(scratch_origin);
    const distance = scratch_forward.length();
    if (distance < 1e-6) return null;

    scratch_forward.divideScalar(distance);
    return { distance: distance + aim.overshoot };
};

// per-ray angular offset from the aim direction, in the pattern's own polar
// coords. extra_spread widens whatever the authored pattern already is
const ray_offset = (
    rays: RaycastRays,
    index: number,
    effective_angle_deg: number,
    random: () => number
): { angle_rad: number; theta: number } => {
    if (effective_angle_deg <= 0) return { angle_rad: 0, theta: 0 };

    let angle_deg: number;
    let theta: number;

    if (rays.count === 1) {
        // a lone ray has no slot to sit in, so spread becomes pure scatter
        angle_deg = effective_angle_deg * Math.sqrt(random());
        theta = random() * Math.PI * 2;
    } else if (rays.pattern === "ring") {
        angle_deg = effective_angle_deg;
        theta = (index / rays.count) * Math.PI * 2;
    } else {
        // sqrt keeps the cone area-uniform instead of clumping at the centre,
        // golden angle keeps successive rays from lining up
        const step = (index + 0.5) / rays.count;
        angle_deg = effective_angle_deg * Math.sqrt(step);
        theta = index * GOLDEN_ANGLE;
    }

    if (rays.jitter_deg > 0) {
        angle_deg += (random() * 2 - 1) * rays.jitter_deg;
        theta += (random() * 2 - 1) * MathUtils.degToRad(rays.jitter_deg);
    }

    return { angle_rad: MathUtils.degToRad(Math.max(0, angle_deg)), theta };
};

const passes_filters = (target: Interacted | null, targets: RaycastTargets): boolean => {
    if (!target) return false;

    if (target.type === "player") {
        const players = targets.players;
        if (players && !players.include) return false;
        if (!players) return true;

        if (target.part === "hand" && players.ignore_hands) return false;
        if (target.part === "head" && players.ignore_head) return false;
        if (target.part === "torso" && players.ignore_torso) return false;
        return true;
    }

    const objects = targets.objects;
    if (objects && !objects.include) return false;
    if (!objects) return true;

    if (objects.exclude_object_ids?.includes(target.object_id)) return false;
    if (objects.exclude_tags?.some((tag) => target.tags.includes(tag))) return false;
    if (objects.tag_filter && !objects.tag_filter.some((tag) => target.tags.includes(tag))) {
        return false;
    }

    return true;
};

export interface RaycastHandle {
    fire: (options?: { extra_spread_deg?: number }) => RaycastResult;
    set_enabled: (enabled: boolean) => void;
    set_aim: (aim: RaycastAim) => void;
    set_targets: (targets: RaycastTargets) => void;
    set_rays: (rays: RaycastRays) => void;
    set_thickness: (thickness: number) => void;
    set_min_distance: (min_distance: number) => void;
}

interface RaycastProps {
    config: RaycastInteraction;
    object_id: string;
    handle_ref?: React.RefObject<RaycastHandle | null>;
    on_result?: (result: RaycastResult) => void;
    on_target_change?: (target: Interacted | null, result: RaycastResult) => void;
}

export const Raycast = ({
    config,
    object_id,
    handle_ref,
    on_result,
    on_target_change
}: RaycastProps) => {
    const origin_ref = useRef<Group>(null);
    const { world, rapier, rigidBodyStates } = useRapier();
    const scene = useThree((state) => state.scene);

    const session_mode = useSessionMode();
    const flat_input = useFlatFrameInput();
    const hands = useHands();

    // commands mutate this rather than the prop, so a set_aim survives until
    // the object is modified from the sdk
    const live = useRef(config);
    useEffect(() => {
        live.current = config;
    }, [config]);

    const visual_raycaster = useMemo(() => new Raycaster(), []);
    const rng_ref = useRef<(() => number) | null>(null);
    const shot_counter = useRef(0);

    const last_target_key = useRef<string | null>(null);
    const last_point = useRef(new Vector3());
    const has_reported = useRef(false);
    const last_cast_ms = useRef(0);
    const was_pressed = useRef(false);

    useEffect(() => {
        const seed = config.rays.seed;
        rng_ref.current = seed === undefined ? null : make_rng(seed);
    }, [config.rays.seed]);

    const random = useCallback(() => (rng_ref.current ? rng_ref.current() : Math.random()), []);

    // ---- physics backend ----

    const node_for_collider = useCallback(
        (collider: RapierCollider): Object3D | null => {
            const body = collider.parent();
            if (!body) return null;
            return rigidBodyStates.get(body.handle)?.object ?? null;
        },
        [rigidBodyStates]
    );

    const cast_physics = useCallback(
        (distance: number, targets: RaycastTargets, thickness: number): RaycastHit[] => {
            const ray = new rapier.Ray(scratch_origin, scratch_direction);
            const filter_flags = targets.include_sensors
                ? undefined
                : rapier.QueryFilterFlags.EXCLUDE_SENSORS;

            const own_refs = get_object_refs(object_id)?.current;
            const exclude_body =
                targets.include_self ? undefined : own_refs?.rigid_body.current ?? undefined;

            const to_hit = (
                collider: RapierCollider,
                time_of_impact: number,
                normal: { x: number; y: number; z: number },
                hit_index: number
            ): { hit: RaycastHit; valid: boolean } => {
                const node = node_for_collider(collider);
                const target = resolve_hit_target(node);

                scratch_point
                    .copy(scratch_direction)
                    .multiplyScalar(time_of_impact)
                    .add(scratch_origin);

                return {
                    valid: passes_filters(target, targets),
                    hit: {
                        ray_index: 0,
                        hit_index,
                        distance: time_of_impact,
                        point: scratch_point,
                        normal,
                        interacted: target as Interacted
                    }
                };
            };

            // single hit: rapier can do the filtering for us. pass-through
            // rejects non-targets in the predicate, block just takes the
            // nearest thing and lets the filter decide if it counts
            if (targets.max_hits === 1) {
                const predicate =
                    targets.non_targets === "pass-through"
                        ? (collider: RapierCollider) =>
                            passes_filters(resolve_hit_target(node_for_collider(collider)), targets)
                        : undefined;

                if (thickness > 0) {
                    const shape = new rapier.Ball(thickness);
                    const shape_hit = world.castShape(
                        scratch_origin,
                        scratch_origin_quat,
                        scratch_direction,
                        shape,
                        0,
                        distance,
                        true,
                        filter_flags,
                        undefined,
                        undefined,
                        exclude_body,
                        predicate
                    );

                    if (!shape_hit) return [];
                    const { hit, valid } = to_hit(
                        shape_hit.collider,
                        shape_hit.time_of_impact,
                        shape_hit.normal1,
                        0
                    );
                    return valid ? [hit] : [];
                }

                const ray_hit = world.castRayAndGetNormal(
                    ray,
                    distance,
                    true,
                    filter_flags,
                    undefined,
                    undefined,
                    exclude_body,
                    predicate
                );

                if (!ray_hit) return [];
                const { hit, valid } = to_hit(
                    ray_hit.collider,
                    ray_hit.timeOfImpact,
                    ray_hit.normal,
                    0
                );
                return valid ? [hit] : [];
            }

            // piercing: rapier hands these back unordered, so collect and sort
            // before walking, or "the first thing that blocks" is meaningless
            const found: Array<{
                collider: RapierCollider;
                time_of_impact: number;
                normal: { x: number; y: number; z: number };
            }> = [];

            world.intersectionsWithRay(
                ray,
                distance,
                true,
                (intersection) => {
                    found.push({
                        collider: intersection.collider,
                        time_of_impact: intersection.timeOfImpact,
                        normal: {
                            x: intersection.normal.x,
                            y: intersection.normal.y,
                            z: intersection.normal.z
                        }
                    });
                    return true;
                },
                filter_flags,
                undefined,
                undefined,
                exclude_body
            );

            found.sort((left, right) => left.time_of_impact - right.time_of_impact);

            const hits: RaycastHit[] = [];
            for (const entry of found) {
                const { hit, valid } = to_hit(
                    entry.collider,
                    entry.time_of_impact,
                    entry.normal,
                    hits.length
                );

                if (valid) {
                    hits.push(hit);
                    if (hits.length >= targets.max_hits) break;
                } else if (targets.non_targets === "block") {
                    break;
                }
            }

            return hits;
        },
        [rapier, world, node_for_collider, object_id]
    );

    // ---- visual backend ----

    const cast_visual = useCallback(
        (distance: number, targets: RaycastTargets): RaycastHit[] => {
            visual_raycaster.set(scratch_origin, scratch_direction);
            visual_raycaster.far = distance;

            const own_node = targets.include_self ? null : origin_ref.current;
            const hits: RaycastHit[] = [];

            for (const intersection of visual_raycaster.intersectObjects(scene.children, true)) {
                if (!intersection.object.visible) continue;
                if (intersection.object.userData._is_outline_effect) continue;

                const object_node = resolve_object_node(intersection.object);
                if (own_node && object_node && object_node.userData.object_id === object_id) {
                    continue;
                }

                // meshes carry no body name, so players never resolve here.
                // that is a real limit of visual mode, not a bug
                const target = resolve_hit_target(intersection.object);

                if (!passes_filters(target, targets)) {
                    if (targets.non_targets === "block") break;
                    continue;
                }

                const normal = intersection.normal ?? scratch_direction.clone().negate();
                hits.push({
                    ray_index: 0,
                    hit_index: hits.length,
                    distance: intersection.distance,
                    point: intersection.point,
                    normal,
                    interacted: target as Interacted
                });

                if (hits.length >= targets.max_hits) break;
            }

            return hits;
        },
        [visual_raycaster, scene, object_id]
    );

    // ---- the cast ----

    const fire = useCallback(
        (options?: { extra_spread_deg?: number }): RaycastResult => {
            const settings = live.current;
            shot_counter.current += 1;
            const result: RaycastResult = {
                shot_id: `${object_id}:${shot_counter.current}`,
                hits: [],
                missed_rays: 0
            };

            const origin_node = origin_ref.current;
            if (!origin_node || !settings.enabled) {
                result.missed_rays = settings.rays.count;
                return result;
            }

            origin_node.updateWorldMatrix(true, false);
            origin_node.getWorldPosition(scratch_origin);
            origin_node.getWorldQuaternion(scratch_origin_quat);

            const aim = resolve_aim(settings.aim, origin_node);
            if (!aim) {
                result.missed_rays = settings.rays.count;
                return result;
            }

            build_basis(scratch_forward, scratch_origin_quat);

            const effective_angle =
                settings.rays.angle_deg + (options?.extra_spread_deg ?? 0);

            for (let ray_index = 0; ray_index < settings.rays.count; ray_index++) {
                const { angle_rad, theta } = ray_offset(
                    settings.rays,
                    ray_index,
                    effective_angle,
                    random
                );

                if (angle_rad === 0) {
                    scratch_direction.copy(scratch_forward);
                } else {
                    scratch_lateral
                        .copy(scratch_right)
                        .multiplyScalar(Math.cos(theta))
                        .addScaledVector(scratch_up, Math.sin(theta));

                    scratch_direction
                        .copy(scratch_forward)
                        .multiplyScalar(Math.cos(angle_rad))
                        .addScaledVector(scratch_lateral, Math.sin(angle_rad))
                        .normalize();
                }

                // walk the origin forward before casting, then add the skipped length back onto every hit so distances stay measured from the muzzle rather than from where the ray happened to start
                const skip = Math.min(settings.min_distance, aim.distance);
                const cast_distance = aim.distance - skip;

                if (cast_distance <= 0) {
                    result.missed_rays += 1;
                    continue;
                }

                if (skip > 0) {
                    scratch_cast_origin
                        .copy(scratch_direction)
                        .multiplyScalar(skip)
                        .add(scratch_origin);
                } else {
                    scratch_cast_origin.copy(scratch_origin);
                }

                const hits =
                    settings.targets.against === "visual"
                        ? cast_visual(cast_distance, settings.targets)
                        : cast_physics(cast_distance, settings.targets, settings.thickness);

                if (hits.length === 0) {
                    result.missed_rays += 1;
                    continue;
                }

                for (const hit of hits) {
                    hit.ray_index = ray_index;
                    hit.distance += skip;
                    result.hits.push(hit);
                }
            }

            return result;
        },
        [object_id, random, cast_physics, cast_visual]
    );

    // ---- reporting ----

    const publish = useCallback(
        (result: RaycastResult) => {
            const settings = live.current;
            const nearest = result.hits[0] ?? null;
            const target = nearest?.interacted ?? null;
            const key = target_key(target);

            if (settings.report_target_changes) {
                if (!has_reported.current || key !== last_target_key.current) {
                    on_target_change?.(target, result);
                }
            }

            let should_report = nearest ? settings.report_hits : settings.report_misses;

            if (should_report && settings.firing.type === "continuous") {
                const unchanged = has_reported.current && key === last_target_key.current;

                if (unchanged && settings.firing.ignore_unchanged) {
                    // same target, so only speak up if the hit point actually moved
                    const moved = nearest
                        ? last_point.current.distanceTo(
                            scratch_point.set(nearest.point.x, nearest.point.y, nearest.point.z)
                        )
                        : 0;

                    should_report = moved >= settings.firing.min_change_delta;
                }
            }

            if (should_report) on_result?.(result);

            has_reported.current = true;
            last_target_key.current = key;
            if (nearest) {
                last_point.current.set(nearest.point.x, nearest.point.y, nearest.point.z);
            }
        },
        [on_result, on_target_change]
    );

    useImperativeHandle(
        handle_ref,
        () => ({
            fire: (options) => {
                const result = fire(options);
                publish(result);
                return result;
            },
            set_enabled: (enabled) => {
                live.current = { ...live.current, enabled };
            },
            set_aim: (aim) => {
                live.current = { ...live.current, aim };
            },
            set_targets: (targets) => {
                live.current = { ...live.current, targets };
            },
            set_rays: (rays) => {
                live.current = { ...live.current, rays };
            },
            set_thickness: (thickness) => {
                live.current = { ...live.current, thickness };
            },
            set_min_distance: (min_distance) => {
                live.current = { ...live.current, min_distance };
            },
        }),
        [fire, publish]
    );

    // ---- triggers ----

    // after the step, not during: a held gun's origin moves with the object,
    // and casting in a plain useFrame leaves the ray a frame behind the barrel
    useAfterPhysicsStep(() => {
        const settings = live.current;
        if (!settings.enabled) return;

        const now = performance.now();

        if (settings.firing.type === "continuous") {
            if (now - last_cast_ms.current < settings.firing.interval_ms) return;
            last_cast_ms.current = now;
            publish(fire());
            return;
        }

        if (settings.firing.type !== "on-use") return;

        const holder = get_object_holder(object_id);
        if (settings.firing.require_held && !holder) {
            was_pressed.current = false;
            return;
        }

        // resolved the same way input monitors resolve the "use" action, so a
        // gun and a monitor watching "use" always agree about what happened
        const pressed =
            session_mode === "vr"
                ? settings.firing.require_held
                    ? holder?.trigger.pressed ?? false
                    : hands.some((hand) => hand.trigger.pressed)
                : flat_input.use;

        const just_pressed = pressed && !was_pressed.current;
        was_pressed.current = pressed;

        if (!just_pressed) return;
        if (now - last_cast_ms.current < settings.firing.cooldown_ms) return;

        last_cast_ms.current = now;
        publish(fire());
    });

    // keeps the anchor's world matrix fresh for a fire() arriving off-frame
    useFrame(() => {
        origin_ref.current?.updateWorldMatrix(true, false);
    }, -1);

    const origin_euler = useMemo(() => {
        const quaternion = new Quaternion();
        if (config.origin?.rotation) rotation_to_quaternion(config.origin.rotation, quaternion);
        return quaternion;
    }, [config.origin?.rotation]);

    return (
        <group
            ref={origin_ref}
            position={config.origin?.offset ?? [0, 0, 0]}
            quaternion={origin_euler}
        />
    );
};
