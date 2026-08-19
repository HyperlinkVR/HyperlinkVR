import { PositionalAudio, useGLTF } from "@react-three/drei";
import { CollisionEnterPayload, useRapier } from "@react-three/rapier";
import { useCallback, useRef } from "react";
import type { PositionalAudio as PositionalAudioType } from "three";



import { get_collision_info, ObjectPhysics } from "../engine/ObjectPhysics";
import { Grabbable } from "../interaction";
import { PrefabProps } from "../types";
import { PrefabRoot } from "./PrefabRoot";


const MESH_URL = new URL("../../assets/prefabs/basketball/basketball.glb", import.meta.url).href;

const SFX_LIGHT_URL = new URL("../../assets/prefabs/basketball/light.opus", import.meta.url).href;
const SFX_MEDIUM_URL = new URL("../../assets/prefabs/basketball/medium.opus", import.meta.url).href;
const SFX_HARD_URL = new URL("../../assets/prefabs/basketball/hard.opus", import.meta.url).href;

// force magnitudes at which sound is full volume
const LIGHT_ANCHOR = 1;
const MEDIUM_ANCHOR = 5;
const HARD_ANCHOR = 10;

const compute_audio_weights = (force_magnitude: number) => {
    let light_weight = 0;
    let medium_weight = 0;
    let hard_weight = 0;

    if (force_magnitude <= LIGHT_ANCHOR) {
        light_weight = 1;
    } else if (force_magnitude < MEDIUM_ANCHOR) {
        const blend_factor = (force_magnitude - LIGHT_ANCHOR) / (MEDIUM_ANCHOR - LIGHT_ANCHOR);
        light_weight = 1 - blend_factor;
        medium_weight = blend_factor;
    } else if (force_magnitude < HARD_ANCHOR) {
        const blend_factor = (force_magnitude - MEDIUM_ANCHOR) / (HARD_ANCHOR - MEDIUM_ANCHOR);
        medium_weight = 1 - blend_factor;
        hard_weight = blend_factor;
    } else {
        // hard is full, but add a touch of medium just to make it sound a bit more natural
        hard_weight = 1;
        medium_weight = 0.5;
    }

    // equal power with sqrt keeps perceived loudness roughly constant across the fade
    return {
        light: Math.sqrt(light_weight),
        medium: Math.sqrt(medium_weight),
        hard: Math.sqrt(hard_weight),
    };
}

export const Basketball = (props: PrefabProps) => {
    const {scene} = useGLTF(MESH_URL);
    const instance = scene.clone(true);

    const light_audio_ref = useRef<PositionalAudioType>(null);
    const medium_audio_ref = useRef<PositionalAudioType>(null);
    const hard_audio_ref = useRef<PositionalAudioType>(null);

    // TODO: add random variance to pitches/speed

    const { world } = useRapier();

    const on_collision_enter = useCallback(
        (payload: CollisionEnterPayload) => {
            const light_audio = light_audio_ref.current;
            const medium_audio = medium_audio_ref.current;
            const hard_audio = hard_audio_ref.current;
            if (!light_audio || !medium_audio || !hard_audio) {
                return;
            }

            const {force} = get_collision_info(payload, world.timestep);

            // blend sounds depending on the magnitude of the force
            const force_magnitude = Math.sqrt(force.x * force.x + force.y * force.y + force.z * force.z);
            const weights = compute_audio_weights(force_magnitude);

            light_audio.stop();
            light_audio.offset = 0;
            medium_audio.stop();
            medium_audio.offset = 0;
            hard_audio.stop();
            hard_audio.offset = 0;

            light_audio.setVolume(weights.light);
            medium_audio.setVolume(weights.medium);
            hard_audio.setVolume(weights.hard);

            if (weights.light > 0) {
                light_audio.play();
            }
            if (weights.medium > 0) {
                medium_audio.play();
            }
            if (weights.hard > 0) {
                hard_audio.play();
            }
        },
        []
    );

    return (
        <PrefabRoot tags={["basketball"]} {...props}>
            <ObjectPhysics
                physics={{
                    rigid_body: {
                        type: "dynamic",

                        collider: {
                            type: "sphere",
                            radius: 0.119
                        },

                        mass: 0.6,
                        restitution: 0.8,
                        restitution_combine_rule: "max",
                        friction: 0.75,

                        ccd: true
                    }
                }}
                on_collision_enter={on_collision_enter}
            >
                <Grabbable>
                    <primitive object={instance}/>
                </Grabbable>

                <PositionalAudio
                    ref={light_audio_ref}
                    url={SFX_LIGHT_URL}
                    distance={1}
                    loop={false}
                    autoplay={false}
                />
                <PositionalAudio
                    ref={medium_audio_ref}
                    url={SFX_MEDIUM_URL}
                    distance={1}
                    loop={false}
                    autoplay={false}
                />
                <PositionalAudio
                    ref={hard_audio_ref}
                    url={SFX_HARD_URL}
                    distance={1}
                    loop={false}
                    autoplay={false}
                />
            </ObjectPhysics>
        </PrefabRoot>
    )
}
