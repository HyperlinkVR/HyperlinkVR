import { BasketballHoopPrefab, CylinderCollider } from "@hyperlinkvr/vr-engine-schemas";
import { PositionalAudio, useGLTF } from "@react-three/drei";
import { ParticleSystemRef } from "quarks.r3f";
import { useRef } from "react";
import type { PositionalAudio as PositionalAudioType } from "three";



import { ObjectPhysics } from "../engine/ObjectPhysics";
import { useObjectBinding } from "../hooks/useObjectBinding";
import { ParticleEmitter } from "../interaction/ParticleEmitter";
import { resolve_interacted, TriggerVolume } from "../interaction/TriggerVolume";
import { PrefabProps } from "../types";
import { PrefabRoot } from "./PrefabRoot";


const MESH_URL = new URL("../../assets/prefabs/basketball_hoop/basketball_hoop.glb", import.meta.url).href;
const DING_DING_URL = new URL("../../assets/sfx/dingding.opus", import.meta.url).href;

const TOP_COLLIDER = {
    type: "cylinder",
    radius: 0.15,
    height: 0.025,
    offset: [0, -0.35, 0.375]
} as CylinderCollider;

const BOTTOM_COLLIDER = {
    type: "cylinder",
    radius: 0.18,
    height: 0.025,
    offset: [0, -0.6, 0.375]
} as CylinderCollider;

const TOP_TO_BOTTOM_TIME = 5000;

export const BasketballHoop = ({
    enable_sfx,
    enable_particles,
    binding,
    ...rest
}: PrefabProps<BasketballHoopPrefab>) => {
    const { scene } = useGLTF(MESH_URL);
    const instance = scene.clone(true);

    const audio_ref = useRef<PositionalAudioType>(null);
    const particles_ref = useRef<ParticleSystemRef>(null);

    const { emit_report } = useObjectBinding(binding);

    const entered_top = useRef(new Map<string, number>());

    return (
        <PrefabRoot {...rest}>
            <ObjectPhysics
                physics={{
                    rigid_body: {
                        type: "fixed",

                        collider: {
                            type: "auto",
                            approximation: "trimesh"
                        },

                        restitution: 0.4,
                        friction: 0.5
                    }
                }}>
                <primitive object={instance} />
            </ObjectPhysics>

            <TriggerVolume
                collider={TOP_COLLIDER}
                on_enter={(payload) => {
                    const interacted = resolve_interacted(payload, {
                        ignore_torso: true,
                        ignore_head: true,
                        ignore_hands: true,
                        objects: {
                            include: true,
                            tag_filter: ["basketball"]
                        }
                    });

                    if (!interacted || interacted.type !== "object") return;

                    // const positioning = detect_trigger_direction(payload, TOP_COLLIDER);
                    // if (!positioning) return;

                    // const {direction} = positioning;

                    const linvel = payload.other.rigidBody?.linvel();
                    if (!linvel) return;

                    // travelling down means the ball is going through the hoop from above
                    if (linvel.y < 0) {
                        entered_top.current.set(
                            interacted.object_id,
                            performance.now()
                        );
                        setTimeout(() => {
                            entered_top.current.delete(interacted.object_id);
                        }, TOP_TO_BOTTOM_TIME);
                    }
                }}
            />
            <TriggerVolume
                collider={BOTTOM_COLLIDER}
                on_enter={(payload) => {
                    const interacted = resolve_interacted(payload, {
                        ignore_torso: true,
                        ignore_head: true,
                        ignore_hands: true,
                        objects: {
                            include: true,
                            tag_filter: ["basketball"]
                        }
                    });

                    if (!interacted || interacted.type !== "object") return;

                    const entered_time = entered_top.current.get(
                        interacted.object_id
                    );
                    if (!entered_time) return;

                    if (performance.now() - entered_time > TOP_TO_BOTTOM_TIME) {
                        return;
                    }

                    const linvel = payload.other.rigidBody?.linvel();
                    if (!linvel) return;

                    // it hit the top collider within good time and is still moving downwards, so it must have gone through the hoop
                    if (linvel.y < 0) {
                        entered_top.current.delete(interacted.object_id);

                        emit_report({
                            kind: "basketball-hoop-prefab",
                            payload: {
                                type: "scored",
                                object_id:
                                    interacted.type === "object"
                                        ? interacted.object_id
                                        : undefined
                            }
                        });

                        if (enable_sfx !== false) {
                            const audio = audio_ref.current;
                            if (audio) {
                                // TODO: way to make dupe audio events overlap each other (expose to the sdk too)
                                audio.stop();
                                audio.offset = 0;
                                audio.play();
                            }
                        }

                        if (enable_particles !== false) {
                            const particles = particles_ref.current;
                            if (particles) {
                                particles.restart();
                            }
                        }
                    }
                }}
            />

            <PositionalAudio
                ref={audio_ref}
                url={DING_DING_URL}
                distance={5}
                autoplay={false}
                loop={false}
            />

            <ParticleEmitter
                ref={particles_ref}
                config={{
                    loop: false,
                    autoplay: false,

                    duration: 0.5,
                    lifetime: 2.5,
                    speed: { min: 3, max: 5 },
                    per_second: 50,
                    emitter_shape: {
                        type: "cone",
                        mode: "burst",
                        radius: 0.05,
                        angle: Math.PI / 10
                    },

                    visual: {
                        type: "quad",
                        width: 0.06,
                        height: 0.12
                    },

                    behaviors: [
                        {
                            type: "gravity"
                        }
                        // TODO: fade over life to fade out smoothly (once implemented)
                    ],

                    color: [
                        { color: 0xff0000, alpha: 0.75 },
                        { color: 0xffff00, alpha: 0.75 },
                        { color: 0x00ff00, alpha: 0.75 },
                        { color: 0x0000ff, alpha: 0.75 },
                        { color: 0xff00ff, alpha: 0.75 }
                    ],

                    world_space: true,
                    offset: [0, -0.3, 0.375],
                    rotation: [55, 0, 0]
                }}
            />
        </PrefabRoot>
    );
};
