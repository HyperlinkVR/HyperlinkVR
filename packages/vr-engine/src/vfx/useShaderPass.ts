import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";

import type { BindingConfig, VFXPassSpec } from "@hyperlinkvr/vr-engine-schemas";

import { register_command_handler } from "../engine/trigger_registry";
import { usePass } from "../render/GraphicsPipeline";
import type { RawShader } from "./shaders";


export const useShaderPass = (
    shader: RawShader,
    spec: VFXPassSpec,
    values: Record<string, number>,
    enabled: boolean,
    order: number,
    binding: BindingConfig | undefined
) => {
    const pass = useMemo(() => new ShaderPass(shader), [shader]);
    usePass(pass, order);

    useEffect(() => {
        pass.enabled = enabled;
    }, [pass, enabled]);

    // update the pass uniforms whenever the values change
    const values_key = JSON.stringify(values);
    useEffect(() => {
        for (const u of spec.uniforms) {
            const uniform = pass.uniforms[u.uniform];
            if (uniform) uniform.value = values[u.field] ?? u.default;
        }
    }, [pass, spec, values_key]);

    // binding can be used to toggle and configure the effect via sdk/triggers
    const binding_id = binding?.id;
    useEffect(() => {
        if (!binding_id) return;

        return register_command_handler(binding_id, (command, args) => {
            switch (command) {
                case "set":
                    if (args) {
                        for (const u of spec.uniforms) {
                            const next = args[u.field];
                            if (typeof next !== "number") continue;
                            const uniform = pass.uniforms[u.uniform];
                            if (uniform) uniform.value = next;
                        }
                    }
                    break;
                case "enable":
                    pass.enabled = true;
                    break;
                case "disable":
                    pass.enabled = false;
                    break;
                case "toggle":
                    pass.enabled = !pass.enabled;
                    break;
            }
            return null;
        });
    }, [binding_id, pass, spec]);

    // if the effect is time-driven, update its time uniform each frame
    useFrame(({ clock }) => {
        if (spec.time_driven && pass.enabled && pass.uniforms.time) {
            pass.uniforms.time.value = clock.getElapsedTime();
        }
    });

    return pass;
};
