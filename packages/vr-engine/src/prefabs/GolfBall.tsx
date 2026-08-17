import {useGLTF} from "@react-three/drei";
import {useFrame} from "@react-three/fiber";
import {CollisionEnterPayload} from "@react-three/rapier";
import {ObjectPhysics} from "../engine/ObjectPhysics";
import {PrefabProps} from "../types";
import {GolfBallPrefab} from "@hyperlinkvr/vr-engine-schemas";
import {useEffect, useMemo, useRef} from "react";
import {Mesh} from "three";
import {useObjectBinding} from "../hooks/useObjectBinding";
import {useObjectRefsOptional} from "../contexts/ObjectRefsContext";
import {has_tag_in_object_tree} from "../util/tags";

const MESH_URL = new URL("../../assets/prefabs/golf_ball/golf_ball.glb", import.meta.url).href;

// the material has this colour baked in, so no work required if the user doesn't specify a colour
const DEFAULT_ALBEDO = 0xd9d9d9;

// a ball is settled only when it's both slow and has stopped moving across the ground
const REST_SPEED = 0.08; // m/s, the "clearly still moving" ceiling
const REST_RADIUS = 0.02; // m, must stay within this window to count as settled
const REST_FRAMES = 20; // consecutive qualifying frames before we call it
const MAX_ROLL_MS = 8000; // hard cap so a ball that never fully stops can't hang the turn

export const GolfBall = (props: PrefabProps<GolfBallPrefab>) => {
    const {emit_report} = useObjectBinding(props.binding);
    const refs = useObjectRefsOptional();

    const {scene} = useGLTF(MESH_URL);
    const instance = useMemo(() => scene.clone(true), [scene]);

    useEffect(() => {
        if (!props.color || props.color === DEFAULT_ALBEDO) {
            return;
        }

        instance.traverse((child) => {
            if (child instanceof Mesh && child.material) {
                const cloned_material = child.material.clone();
                cloned_material.color.setHex(props.color);
                child.material = cloned_material;
            }
        });
    }, [instance, props.color]);

    // settled when rolling is false
    const rolling = useRef(false);
    const settle_frames = useRef(0);
    const roll_started_at = useRef(0);
    const settle_anchor = useRef<{x: number; y: number; z: number} | null>(null);

    // any putter contact is a stroke, however soft, so there's no gentle nudge loophole
    const on_collision_enter = (payload: CollisionEnterPayload) => {
        if (!has_tag_in_object_tree(payload.other.rigidBodyObject ?? null, "golf_putter")) return;

        const body = refs?.rigid_body.current;
        if (!body) return;

        rolling.current = true;
        settle_frames.current = 0;
        settle_anchor.current = null;
        roll_started_at.current = performance.now();

        const velocity = body.linvel();
        emit_report({
            kind: "golf-ball-prefab",
            payload: {
                type: "struck",
                velocity: {x: velocity.x, y: velocity.y, z: velocity.z}
            }
        });
    };

    useFrame(() => {
        const body = refs?.rigid_body.current;
        if (!body || !rolling.current) return;

        const velocity = body.linvel();
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const position = body.translation();

        // horizontal displacement since the settle window opened
        // a ball creeping down a slope keeps moving past REST_RADIUS and so never settles here
        const moved = settle_anchor.current
            ? Math.hypot(position.x - settle_anchor.current.x, position.z - settle_anchor.current.z)
            : Infinity;

        const timed_out = performance.now() - roll_started_at.current > MAX_ROLL_MS;
        const stable = speed < REST_SPEED && moved < REST_RADIUS;

        if (!stable && !timed_out) {
            settle_frames.current = 0;
            settle_anchor.current = {x: position.x, y: position.y, z: position.z};
            return;
        }

        settle_frames.current++;
        if (settle_frames.current < REST_FRAMES && !timed_out) return;

        // force a clean stop so residual creep can't restart the ball after we've reported
        body.setLinvel({x: 0, y: 0, z: 0}, true);
        body.setAngvel({x: 0, y: 0, z: 0}, true);

        rolling.current = false;
        settle_frames.current = 0;
        settle_anchor.current = null;

        emit_report({
            kind: "golf-ball-prefab",
            payload: {
                type: "at-rest",
                position: {x: position.x, y: position.y, z: position.z}
            }
        });
    });

    return (
        <group userData={{tags: ["golf_ball"]}}>
            <ObjectPhysics
                physics={{
                    report_collisions: false,
                    rigid_body: {
                        type: "dynamic",
                        mass: 0.045,
                        restitution: 0.4,
                        friction: 0.5,
                        linear_damping: 0.75,
                        angular_damping: 0.75,
                        ccd: true,
                        collider: {type: "sphere", radius: 0.03},
                        collision_filter: {players: false}
                    }
                }}
                on_collision_enter={on_collision_enter}
            >
                <primitive object={instance} />
            </ObjectPhysics>
        </group>
    );
};
