import {
    DirectionalLightInteraction,
    FollowPlayerInteraction, GlobalAudioInteraction, GrabbableInteraction, Interaction,
    ParticleEmitterInteraction, PointLightInteraction,
    PositionalAudioInteraction, SeatInteraction, SpotLightInteraction, TriggerVolumeInteraction
} from "@hyperlinkvr/vr-engine-schemas";
import {useEffect, useMemo, useRef} from "react";

import { useObjectRefs } from "../contexts/ObjectRefsContext";
import { useAudioListener } from "../contexts/AudioListenerContext";
import { useObjectBinding } from "../hooks/useObjectBinding";
import { Grabbable } from "../interaction";
import { FollowPlayer } from "../interaction/FollowPlayer";
import {detect_trigger_direction, resolve_interacted, TriggerVolume} from "../interaction/TriggerVolume";
import {
    Audio,
    AudioLoader,
    DirectionalLight,
    Euler,
    Group, MathUtils, Object3D,
    PointLight,
    SpotLight, Vector3,
} from "three";
import {PositionalAudio} from "@react-three/drei";
import type { PositionalAudio as PositionalAudioType } from "three";
import {rotation_to_euler} from "./rotation";
import type {ParticleSystemRef} from "quarks.r3f";
import {ParticleEmitter} from "../interaction/ParticleEmitter";
import {is_seated_on, sit_on, stand_up} from "../player/seating";
import {get_capsule_world_position} from "../player/motion";
import {useSetting} from "@hyperlinkvr/react";
import {useXRInputSourceState} from "@react-three/xr";
import {useFrame} from "@react-three/fiber";
import {useFlatFrameInput} from "../input/impl/flat/bindings";
import {useSessionMode} from "../contexts/SessionModeContext";


interface InteractionWrapperProps<I extends Interaction = Interaction> {
    interaction: I;
    children: React.ReactNode;
}

const GrabbableWrapper = ({interaction, children}: InteractionWrapperProps<GrabbableInteraction>) => {
    const {emit_report} = useObjectBinding(interaction.binding);

    // TODO: should we pass through the root ref? or let the wrapper impls manage their own?
    return (
        <Grabbable
            collider={interaction.collider}
            grab_distance={interaction.grab_distance}
            grab_offset={interaction.grab_offset?.position}
            grab_rotation={interaction.grab_offset?.rotation}
            grab_offset_space={interaction.grab_offset?.space}
            sticky={interaction.sticky}
            snap_to_hand={interaction.snaps_to_hand}
            on_grab_start={
                interaction.report_grabs
                    ? (hand) => emit_report({ kind: "grab", payload: { type: "grab", handedness: hand.handedness } })
                    : undefined
            }
            on_grab_end={
                interaction.report_releases
                    ? (hand) => emit_report({ kind: "grab", payload: { type: "release", handedness: hand?.handedness ?? "right" } })
                    : undefined
            }
            on_nearby_start={
                interaction.report_proximity
                    ? (hand) => emit_report({ kind: "grab", payload: { type: "proximity", handedness: hand.handedness } })
                    : undefined
            }
            flat_throwable={interaction.flat_throwable}
            min_flat_throw_speed={interaction.min_flat_throw_speed}
            max_throw_speed={interaction.max_throw_speed}
        >
            {children}
        </Grabbable>
    );
}

const TriggerVolumeWrapper = ({interaction, children}: InteractionWrapperProps<TriggerVolumeInteraction>) => {
    const {emit_report} = useObjectBinding(interaction.binding);
    const anchor_ref = useRef<Group>(null);

    return (
        <>
            <group ref={anchor_ref} />
            {children}
            <TriggerVolume
                collider={interaction.collider}
                on_enter={interaction.report_enter
                    ? (payload) => {
                        const interacted = resolve_interacted(payload, interaction);
                        if (!interacted) return;

                        const positioning = detect_trigger_direction(payload, interaction.collider);

                        const interacted_with_positioning = {
                            ...interacted,
                            positioning: positioning ? {
                                direction: positioning.direction,
                                local_offset: [positioning.local_offset.x, positioning.local_offset.y, positioning.local_offset.z]
                            } : undefined
                        };

                        emit_report({ kind: "trigger-volume", payload: { type: "enter", interacted: interacted_with_positioning } });
                    }
                    : undefined
                }
                on_exit={interaction.report_exit
                    ? (payload) => {
                        const interacted = resolve_interacted(payload, interaction);
                        if (!interacted) return;
                        emit_report({ kind: "trigger-volume", payload: { type: "exit", interacted } });
                    }
                    : undefined
                }
                anchor_ref={anchor_ref}
            />
        </>
    )
}

const FollowPlayerWrapper = ({interaction, children}: InteractionWrapperProps<FollowPlayerInteraction>) => {
    const {on_command} = useObjectBinding(interaction.binding);

    useEffect(() => {
        const handle_command = async (command: string, args?: any) => {
            switch (command) {
                case "set_enabled":
                    interaction.enabled = args.enabled;
                    break;
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }

            return {success: true};
        }

        const unlisten = on_command(handle_command);
        return () => {
            unlisten();
        }
    }, [on_command, interaction]);

    return (
        <FollowPlayer enabled={interaction.enabled} snap_on_release={interaction.snap_on_release}>
            {children}
        </FollowPlayer>
    )
}

const PositionalAudioWrapper = ({interaction, children}: InteractionWrapperProps<PositionalAudioInteraction>) => {
    const {on_command} = useObjectBinding(interaction.binding);
    const audio_ref = useRef<PositionalAudioType>(null);

    useEffect(() => {
        const handle_command = async (command: string, args?: any) => {
            const audio = audio_ref.current;
            if (!audio) {
                return {success: false, error: "Audio not ready"};
            }

            switch (command) {
                case "play":
                    audio.play();
                    break;
                case "pause":
                    audio.pause();
                    break;
                case "stop":
                    audio.stop();
                    break;
                case "seek": {
                    const is_playing = audio.isPlaying;

                    if (is_playing) {
                        audio.stop();
                    }

                    audio.offset = args.offset;
                    if (is_playing) {
                        audio.play();
                    }
                    break;
                }
                case "is_playing":
                    return audio.isPlaying;
                case "set_loop":
                    interaction.loop = args.loop;
                    break;
                case "set_max_distance":
                    interaction.max_distance = args.max_distance;
                    break;
                case "set_offset":
                    interaction.offset = args.offset;
                    break;
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }

            return {success: true};
        }

        const unlisten = on_command(handle_command);
        return () => {
            unlisten();
        }
    }, [on_command, interaction]);

    return (
        <>
            <PositionalAudio
                ref={audio_ref}
                url={interaction.url}
                loop={interaction.loop}
                autoplay={interaction.autoplay}
                distance={interaction.max_distance}
                position={interaction.offset}
            />
            {children}
        </>
    );
}

const GlobalAudioWrapper = ({interaction, children}: InteractionWrapperProps<GlobalAudioInteraction>) => {
    const {on_command} = useObjectBinding(interaction.binding);

    const audio_listener = useAudioListener();
    const audio = useMemo(() => new Audio(audio_listener), [audio_listener]);

    // TODO: split into per dep effects
    useEffect(() => {
        const loader = new AudioLoader();
        loader.load(interaction.url, (buffer) => {
            audio.setBuffer(buffer);
            audio.setLoop(interaction.loop);
            audio.setVolume(interaction.volume ?? 1.0);
            if (interaction.autoplay) {
                audio.play();
            }
        });

        return () => {
            audio.stop();
            audio.disconnect();
        };
    }, [interaction.url, interaction.loop, interaction.autoplay, interaction.volume]);

    useEffect(() => {
        const handle_command = async (command: string, args?: any) => {
            switch (command) {
                case "play":
                    audio.play();
                    break;
                case "pause":
                    audio.pause();
                    break;
                case "stop":
                    audio.stop();
                    break;
                case "seek": {
                    const is_playing = audio.isPlaying;

                    if (is_playing) {
                        audio.stop();
                    }

                    audio.offset = args.offset;
                    if (is_playing) {
                        audio.play();
                    }
                    break;
                }
                case "is_playing":
                    return audio.isPlaying;
                case "set_loop":
                    interaction.loop = args.loop;
                    break;
                case "set_volume":
                    interaction.volume = args.volume;
                    break;
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }

            return {success: true};
        }

        const unlisten = on_command(handle_command);
        return () => {
            unlisten();
        }
    }, [on_command, interaction]);

    return children;
}

const PointLightWrapper = ({interaction, children}: InteractionWrapperProps<PointLightInteraction>) => {
    const {on_command} = useObjectBinding(interaction.binding);

    // doesn't auto sync to props, so need to manually update value via ref when command is received
    const light_ref = useRef<PointLight>(null);

    useEffect(() => {
        const handle_command = async (command: string, args?: any) => {
            const light = light_ref.current;
            if (!light) {
                return {success: false, error: "Light not ready"};
            }

            switch (command) {
                case "set_color":
                    light.color.setHex(args.color);
                    interaction.color = args.color;
                    break;
                case "set_intensity":
                    light.intensity = args.intensity;
                    interaction.intensity = args.intensity;
                    break;
                case "set_offset":
                    light.position.set(args.offset[0], args.offset[1], args.offset[2]);
                    interaction.offset = args.offset;
                    break;
                case "set_distance":
                    light.distance = args.distance;
                    interaction.distance = args.distance;
                    break;
                case "set_decay":
                    light.decay = args.decay;
                    interaction.decay = args.decay;
                    break;
                // TODO: tween commands
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }
            return {success: true};
        }

        const unlisten = on_command(handle_command);
        return () => unlisten();
    }, [on_command, interaction]);

    return (
        <>
            <pointLight
                ref={light_ref}
                color={interaction.color}
                intensity={interaction.intensity}
                distance={interaction.distance}
                decay={interaction.decay}
                position={interaction.offset}
            />
            {children}
        </>
    );
}

const DirectionalLightWrapper = ({interaction, children}: InteractionWrapperProps<DirectionalLightInteraction>) => {
    const {on_command} = useObjectBinding(interaction.binding);

    // doesn't auto sync to props, so need to manually update value via ref when command is received
    const light_ref = useRef<DirectionalLight>(null);

    useEffect(() => {
        const handle_command = async (command: string, args?: any) => {
            const light = light_ref.current;
            if (!light) {
                return {success: false, error: "Light not ready"};
            }

            switch (command) {
                case "set_color":
                    light.color.setHex(args.color);
                    interaction.color = args.color;
                    break;
                case "set_intensity":
                    light.intensity = args.intensity;
                    interaction.intensity = args.intensity;
                    break;
                case "set_offset":
                    light.position.set(args.offset[0], args.offset[1], args.offset[2]);
                    interaction.offset = args.offset;
                    break;
                case "set_rotation":
                    rotation_to_euler(args.rotation, light.rotation);
                    interaction.rotation = args.rotation;
                    break;
                    // TODO: tween commands
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }
            return {success: true};
        }

        const unlisten = on_command(handle_command);
        return () => unlisten();
    }, [on_command, interaction]);

    const euler_rotation = useMemo(() => {
        const euler = new Euler();
        rotation_to_euler(interaction.rotation, euler);
        return euler;
    }, [interaction.rotation]);

    return (
        <>
            <directionalLight
                ref={light_ref}
                color={interaction.color}
                intensity={interaction.intensity}
                position={interaction.offset}
                rotation={euler_rotation}
            />
            {children}
        </>
    );
}

const SpotLightWrapper = ({interaction, children}: InteractionWrapperProps<SpotLightInteraction>) => {
    const {on_command} = useObjectBinding(interaction.binding);

    // doesn't auto sync to props, so need to manually update value via ref when command is received
    const light_ref = useRef<SpotLight>(null);

    useEffect(() => {
        const handle_command = async (command: string, args?: any) => {
            const light = light_ref.current;
            if (!light) {
                return {success: false, error: "Light not ready"};
            }

            switch (command) {
                case "set_color":
                    light.color.setHex(args.color);
                    interaction.color = args.color;
                    break;
                case "set_intensity":
                    light.intensity = args.intensity;
                    interaction.intensity = args.intensity;
                    break;
                case "set_offset":
                    light.position.set(args.offset[0], args.offset[1], args.offset[2]);
                    interaction.offset = args.offset;
                    break;
                case "set_rotation":
                    rotation_to_euler(args.rotation, light.rotation);
                    interaction.rotation = args.rotation;
                    break;
                case "set_angle":
                    light.angle = args.angle;
                    interaction.angle = args.angle;
                    break;
                case "set_penumbra":
                    light.penumbra = args.penumbra;
                    interaction.penumbra = args.penumbra;
                    break;
                case "set_distance":
                    light.distance = args.distance;
                    interaction.distance = args.distance;
                    break;
                case "set_decay":
                    light.decay = args.decay;
                    interaction.decay = args.decay;
                    break;
                // TODO: tween commands
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }
            return {success: true};
        }

        const unlisten = on_command(handle_command);
        return () => unlisten();
    }, [on_command, interaction]);

    const euler_rotation = useMemo(() => {
        const euler = new Euler();
        rotation_to_euler(interaction.rotation, euler);
        return euler;
    }, [interaction.rotation]);

    return (
        <>
            <spotLight
                ref={light_ref}
                color={interaction.color}
                intensity={interaction.intensity}
                position={interaction.offset}
                rotation={euler_rotation}
                angle={interaction.angle}
                penumbra={interaction.penumbra}
                distance={interaction.distance}
                decay={interaction.decay}
            />
            {children}
        </>
    );
}

const ParticleEmitterWrapper = ({interaction, children}: InteractionWrapperProps<ParticleEmitterInteraction>) => {
    const system_ref = useRef<ParticleSystemRef>(null);

    const {on_command} = useObjectBinding(interaction.binding);

    useEffect(() => {
        const unlisten = on_command(async (command: string, args?: any) => {
            const system = system_ref.current;
            if (!system) {
                return {success: false, error: "Particle system not ready"};
            }

            switch (command) {
                case "play":
                    system.play();
                    break;
                case "pause":
                    system.pause();
                    break;
                    case "restart":
                    system.restart();
                    break;
                case "stop":
                    system.stop();
                    break;
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }
        });

        return () => {
            unlisten();
        }
    }, []);

    return (
        <>
            <ParticleEmitter config={interaction} ref={system_ref} />
            {children}
        </>
    )
}

const SEAT_ACTIVATE_DISTANCE = 1.2; // metres from the seat you must be within to sit

const _seat_capsule = new Vector3();
const _seat_anchor = new Vector3();

// stand if already seated on this seat, otherwise sit if within distance of the anchor
const try_toggle_seat = (
    anchor: Object3D | null,
    seat_id: string,
    yaw_range_rad: [number, number] | null
) => {
    if (is_seated_on(seat_id)) {
        stand_up(seat_id);
        return;
    }
    if (!anchor) return;

    anchor.updateWorldMatrix(true, false);
    _seat_anchor.setFromMatrixPosition(anchor.matrixWorld);
    get_capsule_world_position(_seat_capsule);

    const dx = _seat_capsule.x - _seat_anchor.x;
    const dz = _seat_capsule.z - _seat_anchor.z;
    if (dx * dx + dz * dz > SEAT_ACTIVATE_DISTANCE * SEAT_ACTIVATE_DISTANCE) return;

    sit_on({ anchor, yaw_range_rad, seat_id });
};

interface SeatActivationProps {
    anchor_ref: React.RefObject<Group | null>;
    seat_id: string;
    yaw_range_rad: [number, number] | null;
}

// TODO: seat highlight

// VR: off-hand secondary face button (TODO: should it be configurable or just overlap grab, diff button to dismount)
const VRSeatActivation = ({ anchor_ref, seat_id, yaw_range_rad }: SeatActivationProps) => {
    const [locomotion_hand] = useSetting("vr_locomotion_hand");
    const sit_hand = locomotion_hand === "left" ? "right" : "left";
    const state = useXRInputSourceState("controller", sit_hand);
    const was_pressed = useRef(false);

    useFrame(() => {
        const pressed = state?.gamepad["b-button"]?.state === "pressed";
        if (pressed && !was_pressed.current) {
            try_toggle_seat(anchor_ref.current, seat_id, yaw_range_rad);
        }
        was_pressed.current = pressed ?? false;
    });

    return null;
};

// flat: reuses the "use" action (LMB / right trigger) (TODO: make it a sep bind perhaps, diff button to dismount)
const FlatSeatActivation = ({ anchor_ref, seat_id, yaw_range_rad }: SeatActivationProps) => {
    const input = useFlatFrameInput();
    const was_pressed = useRef(false);

    useFrame(() => {
        const pressed = input.use;
        if (pressed && !was_pressed.current) {
            try_toggle_seat(anchor_ref.current, seat_id, yaw_range_rad);
        }
        was_pressed.current = pressed;
    });

    return null;
};

const SeatActivation = (props: SeatActivationProps) => {
    const mode = useSessionMode();
    return mode === "vr" ? <VRSeatActivation {...props} /> : <FlatSeatActivation {...props} />;
};

const SeatWrapper = ({ interaction, children }: InteractionWrapperProps<SeatInteraction>) => {
    const { id } = useObjectRefs();
    const anchor_ref = useRef<Group>(null);
    const seat_id = `${id}:seat`;

    const yaw_range_rad = useMemo<[number, number] | null>(() => {
        if (!interaction.yaw_range_deg) return null;
        const [min_deg, max_deg] = interaction.yaw_range_deg;
        return [MathUtils.degToRad(min_deg), MathUtils.degToRad(max_deg)];
    }, [interaction.yaw_range_deg]);

    const facing_euler = useMemo(() => {
        const euler = new Euler();
        rotation_to_euler(interaction.facing, euler);
        return euler;
    }, [interaction.facing]);

    return (
        <>
            <group
                ref={anchor_ref}
                position={interaction.anchor_offset}
                rotation={facing_euler}
            />
            <SeatActivation anchor_ref={anchor_ref} seat_id={seat_id} yaw_range_rad={yaw_range_rad} />
            {children}
        </>
    );
};

const INTERACTION_MAP: Record<Interaction["type"], React.ComponentType<InteractionWrapperProps<any>> | null> = {
    "grabbable": GrabbableWrapper,
    "follow-player": FollowPlayerWrapper,
    "trigger-volume": TriggerVolumeWrapper,
    "positional-audio": PositionalAudioWrapper,
    "global-audio": GlobalAudioWrapper,
    "point-light": PointLightWrapper,
    "directional-light": DirectionalLightWrapper,
    "spot-light": SpotLightWrapper,
    "particle-emitter": ParticleEmitterWrapper,
    "seat": SeatWrapper,
} as const;

// first is outermost, last is innermost
// follow player must be the parent to grabbable, others dont matter
// TODO: should we enforce only 1 of each interaction type per object? maybe allow multiple controller buttons and trigger volumes tho
const WRAPPER_STRICT_ORDER: Interaction["type"][] = [
    "follow-player",
    "grabbable",
    "trigger-volume",
    "positional-audio",
    "global-audio",
    "point-light",
    "directional-light",
    "spot-light",
];

export const ObjectInteractions = ({interactions, children}: {interactions: Interaction[], children: React.ReactNode}) => {
    const {id} = useObjectRefs();

    const sorted_interactions = useMemo(() => [...interactions].sort((a, b) => {
        const a_index = WRAPPER_STRICT_ORDER.indexOf(a.type);
        const b_index = WRAPPER_STRICT_ORDER.indexOf(b.type);

        // reverse order
        return b_index - a_index;
    }), [interactions]);

    let wrapped_children = children;
    for (const interaction of sorted_interactions) {
        const Wrapper = INTERACTION_MAP[interaction.type];
        if (!Wrapper) {
            console.warn(`No wrapper found for interaction type ${interaction.type}`);
            continue;
        }
        console.log(`Wrapping object ${id} with interaction ${interaction.type}`);
        wrapped_children = <Wrapper interaction={interaction}>{wrapped_children}</Wrapper>;
    }

    return <>{wrapped_children}</>;
}
