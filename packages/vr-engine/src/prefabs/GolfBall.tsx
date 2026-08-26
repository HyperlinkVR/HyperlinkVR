import { GolfBallPrefab } from "@hyperlinkvr/vr-engine-schemas";
import { PositionalAudio, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CollisionEnterPayload } from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mesh, PositionalAudio as PositionalAudioType } from "three";



import { useObjectRefsOptional } from "../contexts/ObjectRefsContext";
import { ObjectPhysics } from "../engine/ObjectPhysics";
import { useObjectBinding } from "../hooks/useObjectBinding";
import { useObjectShadows } from "../hooks/useObjectShadows";
import { PrefabProps } from "../types";
import { has_tag_in_object_tree } from "../util/tags";
import { PrefabRoot } from "./PrefabRoot";


const MESH_URL = new URL("../../assets/prefabs/golf_ball/golf_ball.glb", import.meta.url).href;
// @ts-ignore
const PUTT_SOUNDS = import.meta.glob("../../assets/prefabs/golf_ball/sfx/putt_*.opus", {eager: true, as: "url"});

// the material has this colour baked in, so no work required if the user doesn't specify a colour
const DEFAULT_ALBEDO = 0xd9d9d9;

// a ball is settled only when it's both slow and has stopped moving across the ground
const REST_SPEED = 0.08; // m/s, the "clearly still moving" ceiling
const REST_RADIUS = 0.02; // m, must stay within this window to count as settled
const REST_FRAMES = 20; // consecutive qualifying frames before we call it
const MAX_ROLL_MS = 8000; // hard cap so a ball that never fully stops can't hang the turn

const LINEAR_DAMPING = 2.0;
const ANGULAR_DAMPING = 1.0;

export const GolfBall = (props: PrefabProps<GolfBallPrefab>) => {
    const {emit_report, on_prefab_command} = useObjectBinding(props.binding);
    const refs = useObjectRefsOptional();

    const {scene} = useGLTF(MESH_URL);
    const instance = useMemo(() => scene.clone(true), [scene]);

    useObjectShadows(instance, { cast: true, receive: false });

    const change_color = useCallback(
        (color: number) => {
            instance.traverse((child) => {
                if (child instanceof Mesh && child.material) {
                    const cloned_material = child.material.clone();
                    cloned_material.color.setHex(color);
                    child.material = cloned_material;
                }
            });
        },
        [instance]
    );
    
    useEffect(() => {
        if (!props.color || props.color === DEFAULT_ALBEDO) {
            return;
        }

        change_color(props.color);
    }, [props.color, change_color]);

    const [locked_until_rest, setLockedUntilRest] = useState(false);
    const [locks_out, setLocksOut] = useState(props.locks_out ?? true);

    const [sdk_requested_lock, setSDKRequestedLock] = useState(false);
    const locked = useMemo(() => (locked_until_rest && locks_out) || sdk_requested_lock, [locked_until_rest, sdk_requested_lock]);

    useEffect(() => {
        if (!on_prefab_command) return;

        const handle_command = async (command: string, args?: any) => {
            switch (command) {
                case "set_color":
                    if (typeof args?.color === "number") {
                        change_color(args.color);
                    }
                    break;
                case "set_locks_out":
                    if (typeof args?.locks_out === "boolean") {
                        setLocksOut(args.locks_out);
                    }
                    props.locks_out = args.locks_out;
                    break;
                case "lock":
                    setSDKRequestedLock(true);
                    break;
                case "unlock":
                    if (args?.force) {
                        setLockedUntilRest(false);
                    }
                    setSDKRequestedLock(false);
                    break;
                case "set_damping_enabled":
                    if (typeof args?.enabled === "boolean") {
                        const body = refs?.rigid_body.current;
                        if (body) {
                            body.setLinearDamping(args.enabled ? LINEAR_DAMPING : 0.0);
                            body.setAngularDamping(args.enabled ? ANGULAR_DAMPING : 0.0);
                        }
                    }
                    break;
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }

            return {success: true};
        }
        
        const unlisten = on_prefab_command(handle_command);
        return () => unlisten();
    }, []);

    // settled when rolling is false
    const rolling = useRef(false);
    const settle_frames = useRef(0);
    const roll_started_at = useRef(0);
    const settle_anchor = useRef<{x: number; y: number; z: number} | null>(null);

    const sfx_refs = useRef<PositionalAudioType[]>([]);

    const play_putt_sound = useCallback(() => {
        const sfx = sfx_refs.current;
        if (sfx.length === 0) return;

        const index = Math.floor(Math.random() * sfx.length);
        const audio = sfx[index];
        if (!audio) return;

        audio.stop();
        audio.offset = 0;
        audio.play();
    }, []);

    // any putter contact is a stroke, however soft, so there's no gentle nudge loophole
    const on_collision_enter = (payload: CollisionEnterPayload) => {
        // don't start a new stroke if still rolling
        if (rolling.current) return;

        if (!has_tag_in_object_tree(payload.other.rigidBodyObject ?? null, "golf_putter")) return;

        play_putt_sound();

        const body = refs?.rigid_body.current;
        if (!body) return;

        setLockedUntilRest(true);

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

        setLockedUntilRest(false);

        emit_report({
            kind: "golf-ball-prefab",
            payload: {
                type: "at-rest",
                position: {x: position.x, y: position.y, z: position.z}
            }
        });
    });

    return (
        <PrefabRoot tags={["golf_ball"]} {...props}>
            <ObjectPhysics
                physics={{
                    report_collisions: false,
                    rigid_body: {
                        type: "dynamic",
                        mass: 0.045,
                        restitution: 0.35,
                        friction: 0.5,
                        linear_damping: props.damping ? LINEAR_DAMPING : 0.0,
                        angular_damping: props.damping ? ANGULAR_DAMPING : 0.0,
                        ccd: true,
                        collider: {type: "sphere", radius: 0.03},
                        collision_filter: {players: false, tags: {golf_putter: !locked}}
                    }
                }}
                on_collision_enter={on_collision_enter}
            >
                <primitive object={instance} />

                {/* is this the best way? don't want there to be loading delay, but perhaps theres a neater way that doesn't make a bunch of audio sources */}
                {Object.values(PUTT_SOUNDS).map((url, index) => (
                    <PositionalAudio
                        key={index}
                        ref={(ref) => {
                            if (ref) {
                                sfx_refs.current[index] = ref;
                            }
                        }}
                        url={url as string}
                        distance={1}
                        loop={false}
                        autoplay={false}
                    />
                ))}
            </ObjectPhysics>
        </PrefabRoot>
    );
};

// TODO: sound effect for general collision, not just putts
// TODO: vary putt sound based on strength, not just random
