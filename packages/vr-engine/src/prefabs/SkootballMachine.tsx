import {ObjectPhysics} from "../engine/ObjectPhysics";
import {PositionalAudio, Text, useGLTF} from "@react-three/drei";
import {Grabbable} from "../interaction";
import {RefObject, useCallback, useEffect, useImperativeHandle, useRef, useState} from "react";
import {detect_trigger_direction, resolve_interacted, TriggerVolume} from "../interaction/TriggerVolume";
import {create_object_refs, ObjectRefsContextType, ObjectRefsProvider} from "../contexts";
import {Group, Vector3, PositionalAudio as PositionalAudioType} from "three";
import {IntersectionEnterPayload, IntersectionExitPayload} from "@react-three/rapier";
import {Collider} from "@hyperlinkvr/vr-engine-schemas";
import { PrefabProps } from "../types";
import { PrefabRoot } from "./PrefabRoot";

const MACHINE_URL = new URL("../../assets/prefabs/skootball/machine.glb", import.meta.url).href;
const BALL_URL = new URL("../../assets/prefabs/skootball/ball.glb", import.meta.url).href;

const BELL_URL = new URL("../../assets/prefabs/skootball/carnival_bell.opus", import.meta.url).href;
const BOOP_URL = new URL("../../assets/prefabs/skootball/soft_boop.opus", import.meta.url).href;

const SEMITONE = 1.0594630943592953; // 2^(1/12)

interface BallHandle {
    respawn: (position_override?: [number, number, number]) => void;
}

interface BallProps {
    machine_id: string;
    machine_ref: RefObject<Group | null>;
    id: string;
    initial_position: [number, number, number];
    handle: RefObject<BallHandle>;
}

const Ball = ({machine_id, machine_ref, id, initial_position, handle}: BallProps) => {
    const {scene} = useGLTF(BALL_URL);
    const instance = scene.clone(true);

    const object_refs = useRef<ObjectRefsContextType>(create_object_refs(""));

    const respawn = useCallback(
        (position_override?: [number, number, number], world_space = false) => {
            const new_position = position_override ?? initial_position;

            const pos_vec = new Vector3(new_position[0], new_position[1], new_position[2]);

            if (!world_space) {
                if (!machine_ref.current) {
                    console.warn("respawn called before machine_ref was set, using world space instead");
                    return;
                }

                // convert to world space
                machine_ref.current.localToWorld(pos_vec);
            }

            object_refs.current.rigid_body.current?.setLinvel({x: 0, y: 0, z: 0}, false);
            object_refs.current.rigid_body.current?.setAngvel({x: 0, y: 0, z: 0}, false);
            object_refs.current.rigid_body.current?.setTranslation(pos_vec, true);
        },
        [initial_position]
    );

    useImperativeHandle(handle, () => ({
        respawn
    }), [respawn]);

    return (
        <ObjectRefsProvider value={object_refs.current}>
            <group ref={object_refs.current.root} userData={{object_id: `SKOOTBALL-${id}`, tags: ["skootball_ball", `skootball-${machine_id}`]}}>
                <ObjectPhysics
                    physics={{
                        rigid_body: {
                            type: "dynamic",

                            collider: {
                                type: "sphere",
                                radius: 0.0381
                            },

                            restitution: 0.2,
                            friction: 0.4,
                            mass: 0.2,

                            ccd: true
                        }
                    }}
                    transform={{position: initial_position, rotation: [0, 0, 0], scale: [1, 1, 1]}}
                >
                    <Grabbable>
                        <primitive object={instance}/>
                    </Grabbable>
                </ObjectPhysics>
            </group>
        </ObjectRefsProvider>
    );
}

const TEMP_ADJ = 0.128
const SPAWN_OFFSET = [0.4, 0.8 - TEMP_ADJ, 1.875] as [number, number, number];

const POINT_COLLIDERS = {
    10: {
        type: "cylinder",
        radius: 0.05,
        height: 0.025,
        offset: [0, 0.855 - TEMP_ADJ, -0.8],
        rotation: [Math.PI / 4, 0, 0]
    },
    20: {
        type: "cylinder",
        radius: 0.05,
        height: 0.025,
        offset: [0, 0.9375 - TEMP_ADJ, -0.875],
        rotation: [Math.PI / 4, 0, 0]
    },
    30: {
        type: "cylinder",
        radius: 0.06,
        height: 0.025,
        offset: [0, 1.055 - TEMP_ADJ, -0.97],
        rotation: [Math.PI / 4, 0, 0]
    },
    40: {
        type: "cylinder",
        radius: 0.06,
        height: 0.025,
        offset: [0, 1.165 - TEMP_ADJ, -1.07],
        rotation: [Math.PI / 4, 0, 0]
    },
    50: {
        type: "cylinder",
        radius: 0.05,
        height: 0.025,
        offset: [0, 1.225 - TEMP_ADJ, -1.2],
        rotation: [Math.PI / 4, 0, 0]
    },
    left_100: {
        type: "cylinder",
        radius: 0.05,
        height: 0.025,
        offset: [-0.23, 1.37 - TEMP_ADJ, -1.235],
        rotation: [Math.PI / 4, 0, 0]
    },
    right_100: {
        type: "cylinder",
        radius: 0.05,
        height: 0.025,
        offset: [0.23, 1.37 - TEMP_ADJ, -1.235],
        rotation: [Math.PI / 4, 0, 0]
    }
} as Record<string, Collider>;

const POINT_ORDER = [10, 20, 30, 40, 50, 100] as const;

export const SkootballMachine = (props: PrefabProps) => {
    const {scene} = useGLTF(MACHINE_URL);
    const instance = scene.clone(true);

    const [playing, setPlaying] = useState(false);
    const [balls_remaining, setBallsRemaining] = useState(9);
    const [score, setScore] = useState(0);

    // they have 9 balls, but we only spawn 3 at a time (just like how a real machine might recycle ball for a play session)
    const ball_handles = useRef(new Map<string, RefObject<BallHandle>>);
    const [ball_ids, setBallIDs] = useState<string[]>([]);

    // internal ref to track remaining balls instantaneously
    const balls_remaining_ref = useRef(balls_remaining);

    const machine_id = useRef(crypto.randomUUID()).current;
    const machine_ref = useRef<Group>(null);

    const bell_audio_ref = useRef<PositionalAudioType>(null);
    const boop_audio_ref = useRef<PositionalAudioType>(null);

    const spawn_ball = useCallback(
        () => {
            if (ball_handles.current.size >= 3) return;

            const new_ball_id = crypto.randomUUID();
            const new_ball_handle: RefObject<BallHandle> = {current: null as any};

            ball_handles.current.set(new_ball_id, new_ball_handle);
            setBallIDs(prev => [...prev, new_ball_id]);
        },
        []
    );

    const respawn_ball = useCallback(
        (id: string) => {
            const ball_handle = ball_handles.current.get(id)?.current;
            if (!ball_handle) return;

            ball_handle.respawn();
        },
        []
    );

    const cleanup = useCallback(
        () => {
            ball_handles.current.clear();
            setBallIDs([]);
        },
        []
    );

    const ball_scored = useCallback(
        (id: string, points: number) => {
            if (points !== 0) {
                setScore(prev => prev + points);
            }

            setBallsRemaining(prev => prev - 1);
            balls_remaining_ref.current -= 1;

            if (balls_remaining_ref.current <= 0) {
                // game over
                setPlaying(false);
                cleanup();
            } else if (balls_remaining_ref.current >= 3) {
                respawn_ball(id);
            } else {
                // remove the ball from the machine
                ball_handles.current.delete(id);
                setBallIDs(prev => prev.filter(ball_id => ball_id !== id));
            }

            // play sound effect
            const boop_audio = boop_audio_ref.current;
            if (!boop_audio) return;

            if (points > 0) {
                boop_audio.stop();
                boop_audio.offset = 0;

                const pitch_change = Math.pow(SEMITONE, POINT_ORDER.indexOf(points as typeof POINT_ORDER[number]));
                boop_audio.setPlaybackRate(pitch_change);
                boop_audio.play();
            }
        },
        [respawn_ball]
    );

    // when the game starts, spawn 3 balls with a slight stagger to allow them to roll naturally
    useEffect(() => {
        if (!playing) return;

        cleanup();
        setBallsRemaining(9);
        balls_remaining_ref.current = 9;
        setScore(0);

        spawn_ball();
        const spawn_interval = setInterval(() => {
            if (ball_handles.current.size >= 3) {
                clearInterval(spawn_interval);
                return;
            }

            spawn_ball();
        }, 1000);

        return () => {
            clearInterval(spawn_interval);
        };
    }, [playing, spawn_ball]);

    const is_our_ball = useCallback(
        (payload: IntersectionEnterPayload | IntersectionExitPayload) => {
            const interacted = resolve_interacted(payload, {
                ignore_torso: true,
                ignore_head: true,
                ignore_hands: true,
                objects: {
                    include: true,
                    tag_filter: [`skootball-${machine_id}`]
                }
            });

            if (!interacted || interacted.type !== "object") return false;

            return interacted.object_id.replace("SKOOTBALL-", "");
        },
        [machine_id]
    );

    // ball id -> points scored, to be held until the ball hits the killbox for better look
    const pending_points = useRef(new Map<string, number>());

    const PointCollider = useCallback(({value, side}: {value: number, side?: "left" | "right"}) => {
        const collider = side ? POINT_COLLIDERS[`${side}_${value}`] : POINT_COLLIDERS[`${value}`];

        return (
            <TriggerVolume
                collider={collider}
                on_enter={(payload) => {
                    const ball_id = is_our_ball(payload);
                    if (!ball_id) return;

                    // TODO: how reliable is this for what we want? could do vel but it wont be straight anyway
                    const positioning = detect_trigger_direction(payload, collider);
                    if (!positioning) return;

                    const {direction} = positioning;

                    if (direction === "top") {
                        // prepare score to apply when reaching killbox (allowing to be overridden if it intersects a later hole before reaching the killbox, and to look prettier)
                        pending_points.current.set(ball_id, value);
                    }
                }}
            />
        );
    }, [is_our_ball]);

    return (
        <PrefabRoot ref={machine_ref} {...props}>
            {/* clickable start text TODO improve this */}
            {!playing && (
                <Text
                    position={[0, 1.5, 1.5]}
                    fontSize={0.4}
                    color={"white"}
                    onPointerDown={() => {
                        setPlaying(true);

                        const bell_audio = bell_audio_ref.current;
                        if (!bell_audio) return;

                        bell_audio.stop();
                        bell_audio.offset = 0;
                        bell_audio.play();
                    }}
                >
                    Start
                </Text>
            )}

            {/* machine body */}
            <ObjectPhysics physics={{
                rigid_body: {
                    type: "fixed",

                    collider: {
                        type: "auto",
                        approximation: "trimesh"
                    },

                    restitution: 0.1,
                    friction: 0.7,
                }
            }}>
                <primitive object={instance}/>
            </ObjectPhysics>

            {/* spawn stored balls */}
            {ball_ids.map((id) => (
                <Ball
                    key={id}
                    machine_id={machine_id}
                    machine_ref={machine_ref}
                    id={id}
                    initial_position={SPAWN_OFFSET}
                    handle={ball_handles.current.get(id)!}
                />
            ))}

            {/* machine display */}
            <group position={[0, 1.675 - TEMP_ADJ, -1.2]}>
                <Text fontSize={0.1} color={"white"} anchorX="center" anchorY="middle">
                    {score}
                </Text>
                <Text fontSize={0.05} color={"white"} anchorX="center" anchorY="middle" position={[0, -0.1, 0]}>
                    {playing ? `${balls_remaining} ball${balls_remaining === 1 ? "" : "s"} left` : "Game Over"}
                </Text>

                <PositionalAudio
                    ref={bell_audio_ref}
                    url={BELL_URL}
                    distance={1}
                    loop={false}
                    autoplay={false}
                />
                <PositionalAudio
                    ref={boop_audio_ref}
                    url={BOOP_URL}
                    distance={1}
                    loop={false}
                    autoplay={false}
                />
            </group>

            {/* trigger volume to find balls that go out of bounds on exit */}
            <TriggerVolume
                collider={{
                    type: "box",
                    size: [2, 3, 6],
                    offset: [0, 1.5, 1.75]
                }}

                on_exit={(payload) => {
                    // check if a ball from our machine was what exited
                    const ball_id = is_our_ball(payload);
                    if (!ball_id) return;

                    // respawn the ball that exited for free
                    respawn_ball(ball_id);
                }}
            />

            <PointCollider value={10} />
            <PointCollider value={20} />
            <PointCollider value={30} />
            <PointCollider value={40} />
            <PointCollider value={50} />
            <PointCollider value={100} side="left" />
            <PointCollider value={100} side="right" />

            <TriggerVolume
                collider={{
                    type: "box",
                    size: [0.75, 1, 1.1],
                    offset: [0, 0, -0.8],
                }}

                // killbox at the bottom, applies any pending points and respawns
                on_enter={(payload) => {
                    const ball_id = is_our_ball(payload);
                    if (!ball_id) return;

                    const ball_score = pending_points.current.get(ball_id) ?? 0;
                    pending_points.current.delete(ball_id);

                    ball_scored(ball_id, ball_score);
                }}
            />
        </PrefabRoot>
    );
}

// TODO: respawn any stationary ball outside the return box after some time
