import type {GrabCollider, Rotation} from "@hyperlinkvr/vr-engine-schemas";
import { useFrame } from "@react-three/fiber";
import {RapierRigidBody, useRapier} from "@react-three/rapier";
import { ComponentProps, RefObject, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BackSide, Box3, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, Raycaster, Sphere, Vector3 } from "three";

import { useObjectRefsOptional } from "../contexts";
import { useSessionMode } from "../contexts/SessionModeContext";
import { PLAYER_FILTER_BIT, PLAYER_IGNORE_RELEASE_DELAY_S } from "../engine/collision_groups";
import { Hand, useHands } from "../input/hands";
import {FULL_THROW_CHARGE_S} from "../input/values";
import {HintLayer, useSetHintState} from "../input/impl/flat/hints";
import { CAPSULE_RADIUS, get_capsule_world_position } from "../player/motion";
import {rotation_to_quaternion} from "../engine/rotation";
import {set_object_holder, clear_object_holder} from "./util/holders";

enum RigidBodyType {
    Fixed = 1,
    Dynamic = 0,
    KinematicPositionBased = 2,
    KinematicVelocityBased = 3
}

const DEFAULT_FLAT_MIN_THROW_SPEED = 3; // m/s, a tap of the throw key
const DEFAULT_MAX_THROW_SPEED = 18; // m/s, full charge
const RELEASE_HEADROOM_MULT = 1.2; // the player can throw a touch faster than max throw speed if locomoting
const MAX_INHERITED_SPEED = 8; // cap on carry-slot velocity combined into a flat throw
const VR_THROW_BOOST = 1.5; // vr tracking can undersell how fast the hand is moving, so boost the throw a bit

// flat aims with the crosshair, whose ray starts at the head rather than the
// hand, so when no explicit reach is given the flat default extends the
// authored (hand-to-object) grab distance by roughly that head offset
const FLAT_REACH_HEAD_OFFSET = 1.75;

// flat only: crosshair hover should beat grip proximity in the closest-object
// arbitration, so hovered bids are shifted into their own priority band
const HOVER_BID_PRIORITY = -1000;

// released objects stay player-transparent until the capsule is clear of the
// grab region by this skin on top of the capsule radius
const RESTORE_CLEARANCE_SKIN = 0.05;
const RESTORE_FOOT_PROBE_DROP = 0.7;

// jumping to the carry pose in one step gives the kinematic body a huge implied velocity,
// which rockets any dynamic body it clips on the way
// instead the held body approaches the carry pose at a capped speed
const ATTACH_MAX_SPEED = 8; // m/s

const MAX_DRIVE_ANGVEL = 25; // rad/s, same job as ATTACH_MAX_SPEED but for spin

const drive_target_quat = new Quaternion();
const drive_error_quat = new Quaternion();
const drive_linvel = new Vector3();

// drives a still-dynamic body toward the carry pose by velocity, sized against the physics timestep
// this means constraints still apply
const drive_body_toward = (
    body: RapierRigidBody,
    target_pos: Vector3,
    target_quat: Quaternion,
    timestep: number
) => {
    const inv_dt = 1 / Math.max(timestep, 1e-4);

    const translation = body.translation();
    drive_linvel
        .set(
            target_pos.x - translation.x,
            target_pos.y - translation.y,
            target_pos.z - translation.z
        )
        .multiplyScalar(inv_dt)
        .clampLength(0, ATTACH_MAX_SPEED);
    body.setLinvel({ x: drive_linvel.x, y: drive_linvel.y, z: drive_linvel.z }, true);

    const rotation = body.rotation();
    drive_error_quat.set(rotation.x, rotation.y, rotation.z, rotation.w).invert();
    drive_target_quat.copy(target_quat);
    drive_error_quat.premultiply(drive_target_quat); // error = target * current⁻¹, world frame

    // shortest path: a negated quaternion is the same rotation the long way round
    if (drive_error_quat.w < 0) {
        drive_error_quat.set(
            -drive_error_quat.x,
            -drive_error_quat.y,
            -drive_error_quat.z,
            -drive_error_quat.w
        );
    }

    const clamped_w = Math.min(1, Math.max(-1, drive_error_quat.w));
    const angle = 2 * Math.acos(clamped_w);
    const sin_half = Math.sqrt(1 - clamped_w * clamped_w);

    if (sin_half < 1e-5 || angle < 1e-5) {
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        return;
    }

    const speed = Math.min(angle * inv_dt, MAX_DRIVE_ANGVEL) / sin_half;
    body.setAngvel(
        {
            x: drive_error_quat.x * speed,
            y: drive_error_quat.y * speed,
            z: drive_error_quat.z * speed
        },
        true
    );
};

// every useGrabbable instance runs its own useFrame, so no single instance can
// know whether it's the closest candidate for a hand. each instance submits a
// distance bid per hand per tick; the winner resolved from the previous
// completed round is authoritative (one tick of latency, imperceptible). the
// registry also tracks which grabbable currently holds each hand, so a hand
// can only ever carry one object at a time.

type GrabbableID = symbol;

interface HandArbitration {
    round_bidders: Set<GrabbableID>; // claimants that have bid in the open round
    best_distance: number;
    best_claimant: GrabbableID | null;
    winner: GrabbableID | null; // resolved from the last completed round
    holder: GrabbableID | null; // grabbable currently held by this hand
}

const hand_arbitrations = new WeakMap<Hand, HandArbitration>();

const get_arbitration = (hand: Hand): HandArbitration => {
    let arbitration = hand_arbitrations.get(hand);
    if (!arbitration) {
        arbitration = {
            round_bidders: new Set(),
            best_distance: Infinity,
            best_claimant: null,
            winner: null,
            holder: null
        };
        hand_arbitrations.set(hand, arbitration);
    }
    return arbitration;
};

const bid_for_hand = (hand: Hand, claimant: GrabbableID, distance: number) => {
    const arbitration = get_arbitration(hand);

    // each grabbable bids at most once per tick, so a repeat bid from the same
    // claimant proves a new tick has started: seal the previous round. this
    // makes sealing self-clocked instead of trusting an external frame counter
    if (arbitration.round_bidders.has(claimant)) {
        arbitration.winner = arbitration.best_claimant;
        arbitration.best_claimant = null;
        arbitration.best_distance = Infinity;
        arbitration.round_bidders.clear();
    }
    arbitration.round_bidders.add(claimant);

    if (distance < arbitration.best_distance) {
        arbitration.best_distance = distance;
        arbitration.best_claimant = claimant;
    }
};

const is_closest_for_hand = (hand: Hand, claimant: GrabbableID): boolean =>
    get_arbitration(hand).winner === claimant;

const hand_holder = (hand: Hand): GrabbableID | null =>
    get_arbitration(hand).holder;

const claim_hand = (hand: Hand, claimant: GrabbableID) => {
    get_arbitration(hand).holder = claimant;
};

const release_hand_claim = (hand: Hand, claimant: GrabbableID) => {
    const arbitration = get_arbitration(hand);
    if (arbitration.holder === claimant) arbitration.holder = null;
};

const excluded_from_bounds = (o: Object3D): boolean => {
    let cur: Object3D | null = o;
    while (cur) {
        if (
            cur.userData._is_outline_effect ||
            cur.userData._exclude_from_bounds // TODO: expose this flag in some way to the sdk when object parenting is introduced
        )
            return true;
        cur = cur.parent;
    }
    return false;
};

export const useOutlineEffect = (
    target_ref: RefObject<Object3D | null>,
    enabled: boolean,
    color = 0x87ed87
) => {
    useEffect(() => {
        const target = target_ref.current;
        if (!target || !enabled) return;

        // 1. Collect all valid meshes into an array first
        const meshes: Mesh[] = [];
        target.traverse((child) => {
            if ((child as Mesh).isMesh && !excluded_from_bounds(child)) {
                meshes.push(child as Mesh);
            }
        });

        // 2. Add outlines to the collected meshes
        meshes.forEach((mesh) => {
            const outline = new Mesh(
                mesh.geometry,
                new MeshBasicMaterial({
                    color: color,
                    side: BackSide
                })
            );

            outline.scale.setScalar(1.05);
            outline.userData._is_outline_effect = true;

            mesh.add(outline);

            // inherit layers from the mesh TODO: should it add a custom outline layer?
            outline.layers.mask = mesh.layers.mask;
        });

        return () => {
            if (!target) return;

            // 3. Remove in a clean pass
            target.traverse((child) => {
                const outlines = child.children.filter(
                    (c) => c.userData._is_outline_effect
                );
                outlines.forEach((outline) => child.remove(outline));
            });
        };
    }, [enabled, color, target_ref]);
};

// takes a hand position already converted to the object's local space,
// returns distance to the grab region (0 when inside). NOTE: the result is in
// local units; callers multiply by the object's world scale for world metres
type RegionTester = (localHand: Vector3) => number;

const distance_from_point_to_segment = (() => {
    const ab = new Vector3();
    const ap = new Vector3();
    const proj = new Vector3();
    return (p: Vector3, a: Vector3, b: Vector3): number => {
        ab.copy(b).sub(a);
        const lenSq = ab.lengthSq();
        const t = lenSq > 0 ? Math.min(1, Math.max(0, ap.copy(p).sub(a).dot(ab) / lenSq)) : 0;
        proj.copy(a).addScaledVector(ab, t);
        return p.distanceTo(proj);
    };
})();

// oriented bounding box from the object's mesh geometry, in local space
const compute_local_bounds = (target: Object3D): Box3 | null => {
    const box = new Box3();
    target.updateWorldMatrix(true, true);
    const inv = new Matrix4().copy(target.matrixWorld).invert();
    const childToLocal = new Matrix4();
    const childBox = new Box3();

    target.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh || excluded_from_bounds(child)) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        if (!mesh.geometry.boundingBox) return;
        childBox.copy(mesh.geometry.boundingBox);
        childToLocal.multiplyMatrices(inv, mesh.matrixWorld);
        childBox.applyMatrix4(childToLocal);
        box.union(childBox);
    });

    return box.isEmpty() ? null : box; // empty until the GLTF geometry has loaded
};

const bounding_box_tester = (target: Object3D): RegionTester | null => {
    const box = compute_local_bounds(target);
    if (!box) return null;
    return (p) => box.distanceToPoint(p);
};

const bounding_sphere_tester = (target: Object3D): RegionTester | null => {
    const box = compute_local_bounds(target);
    if (!box) return null;
    const sphere = box.getBoundingSphere(new Sphere());
    const center = sphere.center.clone();
    const radius = sphere.radius;
    return (p) => Math.max(0, p.distanceTo(center) - radius);
};

const build_region_tester = (collider: GrabCollider | undefined, target: Object3D): RegionTester | null => {
    if (!collider) return bounding_box_tester(target);

    switch (collider.type) {
        case "box": {
            const [size_x, size_y, size_z] = collider.size; // full size
            const box = new Box3(
                new Vector3(-size_x / 2, -size_y / 2, -size_z / 2),
                new Vector3(size_x / 2, size_y / 2, size_z / 2)
            );
            return (p) => box.distanceToPoint(p);
        }
        case "sphere": {
            const radius = collider.radius;
            return (p) => Math.max(0, p.length() - radius); // centered at origin
        }
        case "capsule": {
            const radius = collider.radius;
            const segment_half = Math.max(0, collider.height / 2 - radius); // full-height assumption
            const cap_a = new Vector3(0, -segment_half, 0);
            const cap_b = new Vector3(0, segment_half, 0);
            return (p) => Math.max(0, distance_from_point_to_segment(p, cap_a, cap_b) - radius);
        }
        case "auto-bounding-box": {
            return bounding_box_tester(target);
        }
        case "auto-bounding-sphere": {
            return bounding_sphere_tester(target);
        }
        default:
            console.warn(`Unhandled collider`, collider);
            return null;
    }
};

const _rc = new Raycaster();
_rc.layers.enableAll(); // grabbables can live on non-default render layers
const _ro = new Vector3();
const _rd = new Vector3();
const _rq = new Quaternion();
const FWD = new Vector3(0, 0, -1);
const WORLD_UP = new Vector3(0, 1, 0);

const ray_hit_distance = (
    rayNode: Object3D | null,
    target: Object3D,
    reach: number
): number | null => {
    if (!rayNode) return null;
    rayNode.updateWorldMatrix(true, false);
    _ro.setFromMatrixPosition(rayNode.matrixWorld);
    _rd.copy(FWD).applyQuaternion(rayNode.getWorldQuaternion(_rq)).normalize();
    _rc.set(_ro, _rd);
    _rc.far = reach;
    const hits = _rc.intersectObject(target, true);
    return hits.length > 0 ? hits[0].distance : null;
};

// TODO: unite with grabbable props
interface UseGrabbableProps {
    enabled?: boolean;
    grab_distance?: number;
    nearby_trigger_distance?: number;
    reach?: number;
    sticky?: boolean;
    snap_to_hand?: boolean;
    snap_grab_offset?: [number, number, number];
    snap_grab_rotation?: Rotation;
    snap_grab_offset_space?: "grip" | "aim";
    ignore_player_while_held?: boolean;
    player_ignore_release_delay?: number;
    collider?: GrabCollider;
    on_grab_start?: (hand: Hand) => void;
    on_grab_end?: (hand: Hand) => void;
    on_nearby_start?: (hand: Hand) => void;
    on_nearby_end?: (hand: Hand) => void;
    on_trigger_start?: (hand: Hand) => void;
    on_trigger_end?: (hand: Hand | null) => void;
    flat_throwable?: boolean;
    min_flat_throw_speed?: number;
    max_throw_speed?: number;
}

export const useGrabbable = (
    target_ref: RefObject<Object3D | null>,
    {
        enabled = true,
        grab_distance = 1,
        nearby_trigger_distance = 1,
        reach = 0, // 0 = ray-grab disabled (VR default); flat derives a crosshair reach from grab_distance when unset
        // sticky: the grip can be let go, the next grab press drops the object // TODO: it would probably be better as a face button
        // non-sticky: held only while the grip button is down
        sticky = false,
        snap_to_hand = true,
        snap_grab_offset,
        snap_grab_rotation,
        // "grip": offset in raw WebXR grip-space axes (tilts with the wrist).
        // "aim":  offset as [right, up, forward] built from the ray/pointer
        //         direction and world-up, positioned at the grip. Intuitive,
        //         wrist-independent. Only applies to snap/ray grabs.
        snap_grab_offset_space = "aim",
        ignore_player_while_held = true,
        player_ignore_release_delay = PLAYER_IGNORE_RELEASE_DELAY_S,
        collider,
        on_grab_start,
        on_grab_end,
        on_nearby_start,
        on_nearby_end,
        on_trigger_start,
        on_trigger_end,
        flat_throwable = true, // false only prevents using the throw button on flat mode (ui hint). we cant stop vr players throwing. use max_throw_speed = 0 to make it slip out their hand instead
        min_flat_throw_speed = DEFAULT_FLAT_MIN_THROW_SPEED,
        max_throw_speed = DEFAULT_MAX_THROW_SPEED
    }: UseGrabbableProps = {}
) => {
    const hands = useHands();
    const obj_refs = useObjectRefsOptional();
    const body_ref = obj_refs?.rigid_body ?? null;

    const grabbable_id = useMemo<GrabbableID>(() => Symbol("grabbable"), []);

    const session_mode = useSessionMode();
    const flat_mode = session_mode !== "vr";

    // vr: grabbing is touch proximity, reach stays whatever the caller set
    // (0 by default, ray-grab off, only tested on the press like always).
    // flat: the crosshair is the only pointer, so an unset reach gets a
    // sensible default derived from the authored grab distance
    const effective_reach =
        flat_mode && reach === 0 ? grab_distance + FLAT_REACH_HEAD_OFFSET : reach;

    // both offset props are resolved once
    const resolved_grab_offset: [number, number, number] = snap_grab_offset ?? [0, 0, 0];

    // arrays are fresh objects every render, so key the memo on the values
    const grab_rotation_key = snap_grab_rotation ? snap_grab_rotation.join(",") : "";

    const grab_offset_quat = useMemo(() => {
        const quaternion = new Quaternion();
        if (snap_grab_rotation) rotation_to_quaternion(snap_grab_rotation, quaternion);
        return quaternion;
    }, [grab_rotation_key]);

    // a sticky hold only becomes droppable once the grabbing press has ended, otherwise the same press that picked the object up drops it a frame later // TODO: separate btton
    const sticky_release_armed = useRef(false);

    const should_release = (hand: Hand) => {
        if (!sticky) return !hand.grab.pressed;

        if (!sticky_release_armed.current) {
            sticky_release_armed.current = !hand.grab.pressed;
            return false;
        }
        return hand.grab.just_pressed;
    };

    const hands_ref = useRef(hands);
    hands_ref.current = hands;

    useEffect(
        () => () => {
            // despawned while held: free the hand so it can grab something else
            for (const hand of hands_ref.current) {
                release_hand_claim(hand, grabbable_id);
            }
        },
        [grabbable_id]
    );

    const grabbingHand = useRef<Hand | null>(null);
    const offsetMatrix = useRef(new Matrix4());
    const tempMatrix = useRef(new Matrix4());
    const grabbedHandMatrix = useRef(new Matrix4()); // snapshot of the grabbing hand, isolated from the per-hand scratch matrix
    const snapped_grab = useRef(false); // true when this grab used a carry slot (snap/ray) vs a captured relative pose
    const nearbyHands = useRef(new Set<Hand>());

    const prevGrabPos = useRef(new Vector3());
    const grabVelocity = useRef(new Vector3());
    const just_grabbed = useRef(false);

    const parentInverse = useRef(new Matrix4());
    const _p = useRef(new Vector3());
    const _q = useRef(new Quaternion());
    const _s = useRef(new Vector3());
    const _objPos = useRef(new Vector3());
    const _localHand = useRef(new Vector3());
    const _rayOrigin = useRef(new Vector3());
    const _localRayOrigin = useRef(new Vector3());
    const _capsuleLocal = useRef(new Vector3());
    const _worldScale = useRef(new Vector3());

    // scratch for the "aim" offset frame
    const grip_world_pos = useRef(new Vector3());
    const grip_world_quat = useRef(new Quaternion());
    const grip_scratch_scale = useRef(new Vector3());
    const ray_world_quat = useRef(new Quaternion());
    const aim_forward = useRef(new Vector3());
    const aim_right = useRef(new Vector3());
    const aim_up = useRef(new Vector3());
    const aim_displacement = useRef(new Vector3());
    const unit_scale = useRef(new Vector3(1, 1, 1));
    const grip_offset_position = useRef(new Vector3());
    const aim_target_quat = useRef(new Quaternion());

    const throw_dir_quat = useRef(new Quaternion());
    const throw_velocity = useRef(new Vector3());
    const inherited_velocity = useRef(new Vector3());
    // hands that threw and must fully release grab before re-grabbing, otherwise a still-held RMB instantly re-grabs the object it just threw
    const throw_lockout = useRef(new Set<Hand>());

    const {add_layer, remove_layer} = useSetHintState();

    const publishes_nearby = useRef(false);
    const published_hold_layers = useRef<HintLayer[]>([]);

    const publish_held = useCallback(
        (held: boolean) => {
            if (held) {
                const hold_layers: HintLayer[] = ["holding"];
                if (flat_throwable) hold_layers.push("holding_throwable");
                // TODO: nothing is useable yet, add "holding_useable" here when that exists
                published_hold_layers.current = hold_layers;
                for (const layer of hold_layers) add_layer(layer);
            } else {
                for (const layer of published_hold_layers.current) remove_layer(layer);
                published_hold_layers.current = [];
            }
        },
        [add_layer, remove_layer, flat_throwable]
    );

    useEffect(
        () => () => {
            // withdraw everything on unmount (object despawned while nearby/held)
            if (publishes_nearby.current) {
                publishes_nearby.current = false;
                remove_layer("not_holding");
            }
            for (const layer of published_hold_layers.current) remove_layer(layer);
            published_hold_layers.current = [];
        },
        [remove_layer]
    );

    const region_tester = useRef<RegionTester | null>(null);
    const region_source = useRef<GrabCollider | undefined>(undefined);
    const ensure_region_tester = (target: Object3D): RegionTester | null => {
        if (region_tester.current && region_source.current === collider)
            return region_tester.current;
        const tester = build_region_tester(collider, target);
        if (tester) {
            region_tester.current = tester;
            region_source.current = collider;
        }
        return region_tester.current;
    };

    const attach_gliding = useRef(false);
    const glide_pos = useRef(new Vector3());
    const glide_quat = useRef(new Quaternion());
    const glide_target_pos = useRef(new Vector3());
    const glide_target_quat = useRef(new Quaternion());
    const glide_target_scale = useRef(new Vector3());

    const clamp_attach_glide = useCallback(
        (world_matrix: Matrix4, delta: number) => {
            if (!attach_gliding.current) return;

            world_matrix.decompose(
                glide_target_pos.current,
                glide_target_quat.current,
                glide_target_scale.current
            );

            const distance = glide_pos.current.distanceTo(glide_target_pos.current);
            const max_step = ATTACH_MAX_SPEED * delta;

            if (distance <= max_step) {
                // caught up
                attach_gliding.current = false;
                return;
            }

            const fraction = max_step / distance;
            glide_pos.current.lerp(glide_target_pos.current, fraction);

            // rotation keeps pace with the trip, but always makes some progress so a long glide doesn't arrive with the object still unturned
            glide_quat.current.slerp(glide_target_quat.current, Math.max(fraction, 0.15));

            world_matrix.compose(glide_pos.current, glide_quat.current, glide_target_scale.current);
        },
        []
    );

    // true while the player capsule is still inside (or within margin of) the
    // grab region: restoring collision in that state makes the character
    // controller depenetrate the player violently, potentially through walls
    const capsule_overlaps_object = (region_scale: number): boolean => {
        const target = target_ref.current;
        if (!target) return false;
        const region = ensure_region_tester(target);
        if (!region) return false;

        const margin = CAPSULE_RADIUS + RESTORE_CLEARANCE_SKIN;

        // probe the capsule centre and a lower point (dropped objects land at
        // the player's feet, where the centre probe alone would read clear)
        get_capsule_world_position(_capsuleLocal.current);
        target.worldToLocal(_capsuleLocal.current);
        if (region(_capsuleLocal.current) * region_scale < margin) return true;

        get_capsule_world_position(_capsuleLocal.current);
        _capsuleLocal.current.y -= RESTORE_FOOT_PROBE_DROP;
        target.worldToLocal(_capsuleLocal.current);
        return region(_capsuleLocal.current) * region_scale < margin;
    };

    const tick_collision_restore = (
        body: RapierRigidBody | null,
        region_scale: number,
        delta: number
    ) => {
        if (restore_countdown.current === null || grabbingHand.current) return;
        restore_countdown.current -= delta;
        if (restore_countdown.current <= 0) {
            if (capsule_overlaps_object(region_scale)) {
                // still interpenetrating the player: restoring now would make
                // the character controller depenetrate them violently. hold at
                // zero and retry; restores the moment the player steps clear
                restore_countdown.current = 0;
            } else {
                restore_player_collision(body);
                restore_countdown.current = null;
            }
        }
    };

    const is_trigger_held = useRef(false);

    // ---- player-collision ignore (so a held object can't be batted by the
    // ---- owner's own hands/head/torso), with a falling-edge restore delay ----
    const player_ignored = useRef(false);
    const saved_collision_groups = useRef<number[] | null>(null);
    const restore_countdown = useRef<number | null>(null); // null = no pending restore

    const apply_player_ignore = (body: RapierRigidBody | null) => {
        if (!body || !ignore_player_while_held || player_ignored.current) return;
        const collider_count = body.numColliders();
        const saved: number[] = [];
        for (let index = 0; index < collider_count; index++) {
            const body_collider = body.collider(index);
            const original = body_collider.collisionGroups();
            saved.push(original);
            body_collider.setCollisionGroups(original & ~PLAYER_FILTER_BIT);
        }
        saved_collision_groups.current = saved;
        player_ignored.current = true;
    };

    const restore_player_collision = (body: RapierRigidBody | null) => {
        if (!body || !player_ignored.current) return;
        const saved = saved_collision_groups.current;
        if (saved) {
            const collider_count = body.numColliders();
            for (let index = 0; index < collider_count && index < saved.length; index++) {
                body.collider(index).setCollisionGroups(saved[index]);
            }
        }
        saved_collision_groups.current = null;
        player_ignored.current = false;
    };

    const release_held = (
        hand: Hand,
        body: RapierRigidBody | null,
        velocity: Vector3
    ) => {
        grabbingHand.current = null;
        release_hand_claim(hand, grabbable_id);
        if (obj_refs) clear_object_holder(obj_refs, hand);
        on_grab_end?.(hand);
        publish_held(false);
        attach_gliding.current = false;

        if (hand.throw_intent) {
            hand.throw_intent.held_throwable.current = null;
        }

        if (body) {
            body.setBodyType(RigidBodyType.Dynamic, true);
            // mutates the caller's vector, grabVelocity resets on the next grab and throw_velocity is per-throw scratch
            velocity.clampLength(0, max_throw_speed * RELEASE_HEADROOM_MULT);
            body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
        }

        // keep ignoring the player briefly so the receding hand can't bat the object as it turns dynamic again
        if (player_ignored.current) {
            restore_countdown.current = player_ignore_release_delay;
        }
    };

    // builds the world matrix for a snapped grab whose offset is expressed in
    // the aim frame: forward = pointer direction, up = world up, right = their
    // cross. grab_offset reads as [right, up, forward]. writes into out_matrix.
    const compose_aim_world_matrix = (
        hand: Hand,
        hand_world_matrix: Matrix4,
        offset: [number, number, number],
        out_matrix: Matrix4
    ): Matrix4 => {
        hand_world_matrix.decompose(
            grip_world_pos.current,
            grip_world_quat.current,
            grip_scratch_scale.current
        );

        const rayNode = hand.ray.current;
        if (rayNode) {
            rayNode.updateWorldMatrix(true, false);
            rayNode.getWorldQuaternion(ray_world_quat.current);
            aim_forward.current.copy(FWD).applyQuaternion(ray_world_quat.current).normalize();
        } else {
            // no pointer: fall back to the grip's own forward
            aim_forward.current.copy(FWD).applyQuaternion(grip_world_quat.current).normalize();
        }

        aim_right.current.crossVectors(aim_forward.current, WORLD_UP);
        if (aim_right.current.lengthSq() < 1e-6) {
            // pointing near straight up/down: derive right from the grip instead
            aim_right.current.set(1, 0, 0).applyQuaternion(grip_world_quat.current);
        }
        aim_right.current.normalize();
        aim_up.current.crossVectors(aim_right.current, aim_forward.current).normalize();
        // re-orthonormalise right so the three axes are exactly perpendicular
        aim_right.current.crossVectors(aim_forward.current, aim_up.current).normalize();

        const [offset_right, offset_up, offset_forward] = offset;
        aim_displacement.current
            .set(0, 0, 0)
            .addScaledVector(aim_right.current, offset_right)
            .addScaledVector(aim_up.current, offset_up)
            .addScaledVector(aim_forward.current, offset_forward);

        grip_world_pos.current.add(aim_displacement.current);

        // orientation tracks the grip, then the authored rotation offset is applied in the object's own frame
        aim_target_quat.current
            .copy(grip_world_quat.current)
            .multiply(grab_offset_quat);

        return out_matrix.compose(
            grip_world_pos.current,
            aim_target_quat.current,
            unit_scale.current
        );
    };

    const {world} = useRapier();

    useFrame((_state, delta) => {
        if (!target_ref.current) return;
        target_ref.current.updateWorldMatrix(true, false);

        const body = body_ref?.current ?? null;

        // region testers measure in the object's local space; scale their
        // output back to world metres so thresholds work on scaled objects
        target_ref.current.getWorldScale(_worldScale.current);
        const region_scale = Math.max(
            _worldScale.current.x,
            _worldScale.current.y,
            _worldScale.current.z
        );

        if (!enabled) {
            // fold up any live interaction exactly as if the player let go,
            // so disabling mid-hold can't strand a kinematic body, a hand
            // claim, hint layers, or a lit outline
            if (grabbingHand.current) {
                release_held(grabbingHand.current, body, grabVelocity.current);
            }
            if (is_trigger_held.current) {
                is_trigger_held.current = false;
                on_trigger_end?.(null);
            }
            for (const h of nearbyHands.current) on_nearby_end?.(h);
            nearbyHands.current.clear();
            if (publishes_nearby.current) {
                publishes_nearby.current = false;
                remove_layer("not_holding");
            }
            for (const hand of hands) {
                if (!hand.grab.pressed) throw_lockout.current.delete(hand);
            }
            // a just-released object may still be player-transparent; keep the
            // restore ticking so it solidifies once the player is clear
            tick_collision_restore(body, region_scale, delta);
            return;
        }

        const region = ensure_region_tester(target_ref.current);
        const currentlyNear = new Set<Hand>();
        let activeHandMatrix: Matrix4 | null = null;

        const objPos = _objPos.current.setFromMatrixPosition(
            target_ref.current.matrixWorld
        );

        for (const hand of hands) {
            const gripObj = hand.grip.current;
            if (!gripObj) continue;

            if (!hand.grab.pressed) throw_lockout.current.delete(hand);

            gripObj.updateWorldMatrix(true, false);

            const handMatrix = tempMatrix.current.copy(gripObj.matrixWorld); // already world-space
            const handPos = _p.current.setFromMatrixPosition(handMatrix);

            let distance: number;
            if (region) {
                _localHand.current.copy(handPos);
                target_ref.current.worldToLocal(_localHand.current);
                distance = region(_localHand.current) * region_scale;
            } else {
                distance = handPos.distanceTo(objPos);
            }

            // flat only: crosshair hover, cast every frame so highlight and
            // grab both follow the crosshair. gated by a cheap conservative
            // distance check so we don't raycast every grabbable in the scene.
            // vr never enters this block: grabbing there is touch proximity
            let crosshair_distance: number | null = null;
            if (flat_mode && effective_reach > 0) {
                const rayNode = hand.ray.current;
                if (rayNode) {
                    rayNode.updateWorldMatrix(true, false);
                    _rayOrigin.current.setFromMatrixPosition(rayNode.matrixWorld);

                    let origin_distance: number;
                    if (region) {
                        _localRayOrigin.current.copy(_rayOrigin.current);
                        target_ref.current.worldToLocal(_localRayOrigin.current);
                        origin_distance = region(_localRayOrigin.current) * region_scale;
                    } else {
                        origin_distance = _rayOrigin.current.distanceTo(objPos);
                    }

                    // if the surface is farther from the ray origin than we can
                    // reach, the ray can't possibly hit within reach
                    if (origin_distance <= effective_reach) {
                        crosshair_distance = ray_hit_distance(
                            rayNode,
                            target_ref.current,
                            effective_reach
                        );
                    }
                }
            }

            const hovered = crosshair_distance !== null;
            const proximity_counts = !flat_mode;

            if ((proximity_counts && distance < nearby_trigger_distance) || hovered) {
                // hovered bids (flat only) sit in a lower band so the crosshair
                // target wins arbitration over something merely grip-adjacent;
                // among hovered objects the nearest hit along the ray wins. in
                // vr all bids are plain proximity distances, closest hand wins
                const bid_distance = hovered
                    ? HOVER_BID_PRIORITY + crosshair_distance!
                    : distance;
                bid_for_hand(hand, grabbable_id, bid_distance);

                const holder = hand_holder(hand);
                const highlight_ok =
                    is_closest_for_hand(hand, grabbable_id) &&
                    (holder === null || holder === grabbable_id);

                if (highlight_ok) {
                    currentlyNear.add(hand);
                    if (!nearbyHands.current.has(hand)) on_nearby_start?.(hand);
                }
            }

            const proximity_ok =
                proximity_counts &&
                distance < grab_distance &&
                is_closest_for_hand(hand, grabbable_id);
            // flat: grab whatever the crosshair is hovering. vr: original
            // semantics, ray only tested on the press and only if the caller
            // explicitly opted into a reach
            const ray_ok = flat_mode
                ? hand.grab.just_pressed && hovered
                : hand.grab.just_pressed &&
                effective_reach > 0 &&
                ray_hit_distance(hand.ray.current, target_ref.current, effective_reach) !== null;

            if (
                hand.grab.pressed &&
                !grabbingHand.current &&
                hand_holder(hand) === null &&
                !throw_lockout.current.has(hand) &&
                (proximity_ok || ray_ok)
            ) {
                const use_carry_slot = ray_ok || snap_to_hand;
                snapped_grab.current = use_carry_slot;

                if (use_carry_slot) {
                    // grip-space offset is baked here, aim-space offset is recomputed per frame in the move tail
                    if (snap_grab_offset_space === "grip") {
                        grip_offset_position.current.set(
                            resolved_grab_offset[0],
                            resolved_grab_offset[1],
                            resolved_grab_offset[2]
                        );
                        offsetMatrix.current.compose(
                            grip_offset_position.current,
                            grab_offset_quat,
                            unit_scale.current
                        );
                    } else {
                        offsetMatrix.current.identity();
                    }
                } else {
                    offsetMatrix.current.multiplyMatrices(
                        // keep captured relative pose (VR touch)
                        handMatrix.clone().invert(),
                        target_ref.current.matrixWorld
                    );
                }
                grabbingHand.current = hand;
                claim_hand(hand, grabbable_id);
                if (obj_refs) set_object_holder(obj_refs.id, hand);
                on_grab_start?.(hand);
                publish_held(true);

                // tell the flat input system whether i want to be thrown
                if (hand.throw_intent) {
                    hand.throw_intent.held_throwable.current = flat_throwable;
                }

                prevGrabPos.current.copy(objPos);
                grabVelocity.current.set(0, 0, 0);
                just_grabbed.current = true;
                sticky_release_armed.current = false;

                // constrained bodies stay dynamic and get velocity-driven, so
                // the joint solver keeps authority over what motion is legal
                if (!obj_refs?.constrained.current) {
                    body?.setBodyType(RigidBodyType.KinematicPositionBased, true);
                }

                target_ref.current.matrixWorld.decompose(
                    glide_pos.current,
                    glide_quat.current,
                    glide_target_scale.current
                );
                attach_gliding.current = true;

                // stop colliding with the player while held, and cancel any pending restore from a previous quick release
                apply_player_ignore(body);
                restore_countdown.current = null;
            } else if (grabbingHand.current === hand && should_release(hand)) {
                if (sticky) {
                    // the dropping press is still physically held, reuse the throw lockout so it can't immediately re-grab what it just put down
                    throw_lockout.current.add(hand);
                }

                // boost for vr throws only (which dont use the intent system)
                release_held(hand, body, hand.throw_intent ? grabVelocity.current : grabVelocity.current.multiplyScalar(VR_THROW_BOOST));
            }

            if (grabbingHand.current === hand) {
                // copy into its own storage so later loop iterations overwriting tempMatrix can't corrupt the grabber
                activeHandMatrix = grabbedHandMatrix.current.copy(handMatrix);
                if (hand.trigger.just_pressed) {
                    is_trigger_held.current = true;
                    on_trigger_start?.(hand);
                } else if (hand.trigger.just_released) {
                    is_trigger_held.current = false;
                    on_trigger_end?.(hand);
                }

                const throw_intent = hand.throw_intent;
                if (flat_throwable && throw_intent?.button.just_released) {
                    const normalized = Math.min(
                        throw_intent.charge_seconds.current / FULL_THROW_CHARGE_S,
                        1
                    );

                    // ease-out, most of the power arrives early in the hold
                    const speed = min_flat_throw_speed + Math.sqrt(normalized) * (max_throw_speed - min_flat_throw_speed);

                    // aim along the pointer ray (the crosshair in flat), falling back to the grip's own forward
                    const rayNode = hand.ray.current;
                    if (rayNode) {
                        rayNode.updateWorldMatrix(true, false);
                        rayNode.getWorldQuaternion(throw_dir_quat.current);
                    } else {
                        gripObj.getWorldQuaternion(throw_dir_quat.current);
                    }

                    // inherit carry-slot motion (player locomotion, mouse flicks), capped so a look flick can't stack with full charge
                    inherited_velocity.current
                        .copy(grabVelocity.current)
                        .clampLength(0, MAX_INHERITED_SPEED);

                    throw_velocity.current
                        .copy(FWD)
                        .applyQuaternion(throw_dir_quat.current)
                        .multiplyScalar(speed)
                        .add(inherited_velocity.current);

                    throw_lockout.current.add(hand);
                    release_held(hand, body, throw_velocity.current);
                }
            }
        }

        if (!grabbingHand.current && is_trigger_held.current) {
            is_trigger_held.current = false;
            on_trigger_end?.(null);
        }

        for (const h of nearbyHands.current)
            if (!currentlyNear.has(h)) on_nearby_end?.(h);
        nearbyHands.current = currentlyNear;

        if (currentlyNear.size > 0 && !publishes_nearby.current) {
            publishes_nearby.current = true;
            add_layer("not_holding");
        } else if (currentlyNear.size === 0 && publishes_nearby.current) {
            publishes_nearby.current = false;
            remove_layer("not_holding");
        }

        // ---- move / throw tail ----
        if (grabbingHand.current && activeHandMatrix) {
            const use_aim_offset =
                snapped_grab.current && snap_grab_offset_space === "aim";

            let newWorldMatrix: Matrix4;
            if (use_aim_offset) {
                newWorldMatrix = compose_aim_world_matrix(
                    grabbingHand.current,
                    activeHandMatrix,
                    snap_grab_offset!,
                    tempMatrix.current
                );
            } else {
                newWorldMatrix = tempMatrix.current.multiplyMatrices(
                    activeHandMatrix,
                    offsetMatrix.current
                );
            }

            newWorldMatrix.decompose(_p.current, _q.current, _s.current);
            if (just_grabbed.current) {
                // the object may have teleported to the carry slot this frame;
                // a velocity computed against its pre-grab position is garbage
                // (and turns a tap grab-release into a point-blank rocket)
                just_grabbed.current = false;
                grabVelocity.current.set(0, 0, 0);
            } else {
                grabVelocity.current
                    .copy(_p.current)
                    .sub(prevGrabPos.current)
                    .divideScalar(Math.max(delta, 1e-4));
            }
            prevGrabPos.current.copy(_p.current);

            if (body && obj_refs?.constrained.current) {
                drive_body_toward(body, _p.current, _q.current, world.timestep);
            } else if (body) {
                body.setNextKinematicTranslation({
                    x: _p.current.x,
                    y: _p.current.y,
                    z: _p.current.z
                });
                body.setNextKinematicRotation({
                    x: _q.current.x,
                    y: _q.current.y,
                    z: _q.current.z,
                    w: _q.current.w
                });
            } else {
                if (target_ref.current.parent) {
                    target_ref.current.parent.updateWorldMatrix(true, false);
                    parentInverse.current
                        .copy(target_ref.current.parent.matrixWorld)
                        .invert();
                    newWorldMatrix.premultiply(parentInverse.current);
                }
                newWorldMatrix.decompose(
                    target_ref.current.position,
                    target_ref.current.quaternion,
                    target_ref.current.scale
                );
                target_ref.current.matrixAutoUpdate = true;
            }

            clamp_attach_glide(newWorldMatrix, delta);
        }

        tick_collision_restore(body, region_scale, delta);
    });
};

// TODO: accept props to allow scaling, position/rotation lock etc
// TODO: sticky (press another button to release) and non sticky (releases when grip lost) grabbables

interface GrabbableProps extends ComponentProps<"group"> {
    target_ref?: RefObject<Object3D | null>;
    enabled?: boolean;
    grab_distance?: number;
    nearby_trigger_distance?: number;
    reach?: number; // explicit ray-grab distance; flat auto-derives one when unset, vr stays touch-only at 0
    snap_to_hand?: boolean; // false keeps the pose the object had when touched (vr only, ray grabs always snap)
    sticky?: boolean; // true = press to pick up, press again to drop. false = held only while gripped
    grab_offset?: [number, number, number];
    grab_rotation?: Rotation;
    grab_offset_space?: "grip" | "aim";
    ignore_player_while_held?: boolean;
    player_ignore_release_delay?: number;
    // optional grab-region override from GrabbableInteraction.collider
    // undefined defaults to auto bounding box
    collider?: GrabCollider;
    on_grab_start?: (input: Hand) => void;
    on_grab_end?: (input: Hand) => void;
    on_nearby_start?: (input: Hand) => void;
    on_nearby_end?: (input: Hand | null) => void;
    on_trigger_start?: (input: Hand) => void;
    on_trigger_end?: (input: Hand | null) => void; // TODO: unite these with the wider controller button monitor (or delete)?
    flat_throwable?: boolean;
    min_flat_throw_speed?: number;
    max_throw_speed?: number;
}

export const Grabbable = (props: GrabbableProps) => {
    const {ref, children, collider, ...rest} = props;

    const group_ref = useRef<Group | null>(null);
    useImperativeHandle(ref as RefObject<Group | null>, () => group_ref.current!);

    const target_ref = props.target_ref || group_ref;

    // refcounted rather than boolean: with two vr hands, one hand leaving the
    // nearby radius must not extinguish the outline the other hand is earning
    const [nearby_hand_count, setNearbyHandCount] = useState(0);

    const handle_nearby_start = useCallback(
        (input: Hand) => {
            setNearbyHandCount((count) => count + 1);
            props.on_nearby_start?.(input);
        },
        [props.on_nearby_start]
    );

    const handle_nearby_end = useCallback(
        (input: Hand | null) => {
            setNearbyHandCount((count) => Math.max(0, count - 1));
            props.on_nearby_end?.(input);
        },
        [props.on_nearby_end]
    );

    useGrabbable(target_ref, {
        enabled: props.enabled,
        grab_distance: props.grab_distance,
        nearby_trigger_distance: props.nearby_trigger_distance || props.grab_distance,
        reach: props.reach,
        snap_to_hand: props.snap_to_hand,
        sticky: props.sticky,
        snap_grab_offset: props.grab_offset || [0, 0, 0.15],
        snap_grab_rotation: props.grab_rotation,
        snap_grab_offset_space: props.grab_offset_space || "aim",
        ignore_player_while_held: props.ignore_player_while_held,
        player_ignore_release_delay: props.player_ignore_release_delay,
        collider,
        on_grab_start: props.on_grab_start,
        on_grab_end: props.on_grab_end,
        on_nearby_start: handle_nearby_start,
        on_nearby_end: handle_nearby_end,
        on_trigger_start: props.on_trigger_start,
        on_trigger_end: props.on_trigger_end,
        flat_throwable: props.flat_throwable,
        min_flat_throw_speed: props.min_flat_throw_speed,
        max_throw_speed: props.max_throw_speed
    });

    useOutlineEffect(target_ref, nearby_hand_count > 0);

    return (
        <group ref={group_ref} {...rest}>
            {children}
        </group>
    );
}