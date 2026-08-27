import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";

import type { BindingConfig, VFXPassSpec } from "@hyperlinkvr/vr-engine-schemas";

import { register_command_handler } from "../engine/trigger_registry";
import { usePass } from "../render/GraphicsPipeline";
import type { RawShader } from "./shaders";

export const useImpulsePass = (
    shader: RawShader,
    spec: VFXPassSpec,
    binding: BindingConfig | undefined,
    order: number
) => {
    const pass = useMemo(() => new ShaderPass(shader), [shader]);
    usePass(pass, order);

    // disabled until pulsed, so it costs nothing at rest
    useEffect(() => {
        pass.enabled = false;
    }, [pass]);

    const magnitude = useRef(0);

    const binding_id = binding?.id;
    useEffect(() => {
        if (!binding_id || spec.kind !== "impulse") return;
        const default_magnitude = spec.impulse.default_magnitude;

        return register_command_handler(binding_id, (command, args) => {
            if (command === "pulse") {
                const requested = typeof args?.magnitude === "number" ? args.magnitude : default_magnitude;
                // take the stronger of an existing pulse and the new one, so rapid pulses reinforce rather than cut each other short
                magnitude.current = Math.max(magnitude.current, requested);
            }
            return null;
        });
    }, [binding_id, spec]);

    useFrame(({ clock }) => {
        if (spec.kind !== "impulse") return;
        const impulse = spec.impulse;

        if (magnitude.current > 0.001) {
            pass.enabled = true;
            if (impulse.time_uniform && pass.uniforms[impulse.time_uniform]) {
                pass.uniforms[impulse.time_uniform]!.value = clock.getElapsedTime();
            }
            pass.uniforms[impulse.uniform]!.value = magnitude.current;
            magnitude.current *= impulse.decay;
        } else if (pass.enabled) {
            magnitude.current = 0;
            pass.uniforms[impulse.uniform]!.value = 0;
            pass.enabled = false;
        }
    });

    return pass;
};
