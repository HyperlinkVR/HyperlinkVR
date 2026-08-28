import { VFX_SPECS, type VFXEffect } from "@hyperlinkvr/vr-engine-schemas";



import { PASS_ORDER } from "../render/GraphicsPipeline";
import { useVFXStore } from "../stores/VFXStore";
import { VFX_SHADERS } from "./shaders";
import {
    useDeclarativeShaderPass,
    useDeclarativeThreePass
} from "./useDeclarativePass";
import { useImpulsePass } from "./useImpulsePass";
import { useMemo } from "react";
import { VFX_THREE_PASSES } from "./three_passes";


const VFXDeclarativeShaderMount = ({ effect, order }: { effect: VFXEffect; order: number }) => {
    const spec = VFX_SPECS[effect.type];
    const { type: _type, enabled, binding, ...values } = effect;
    useDeclarativeShaderPass(VFX_SHADERS[effect.type], spec, values as Record<string, number>, enabled, order, binding);
    return null;
};

const VFXDeclarativeThreePassMount = ({ effect, order }: { effect: VFXEffect; order: number }) => {
    const spec = VFX_SPECS[effect.type];
    const { type: _type, enabled, binding, ...values } = effect;

    const instance = useMemo(() => {
        if (!(effect.type in VFX_THREE_PASSES)) {
            throw new Error(`VFX effect type ${effect.type} is not a valid three.js pass`);
        }

        // stores prebound function that takes all values and outputs the constructed instance
        const construct_pass = VFX_THREE_PASSES[effect.type as keyof typeof VFX_THREE_PASSES]!;
        return construct_pass(values);
    }, [effect.type, values]);

    useDeclarativeThreePass(instance, spec, values as Record<string, number>, enabled, order, binding);

    return null;
}

const VFXDeclarativeMount = ({ effect, order }: { effect: VFXEffect; order: number }) => {
    const spec = VFX_SPECS[effect.type];
    if (spec.source === "shader") {
        return <VFXDeclarativeShaderMount effect={effect} order={order} />;
    } else if (spec.source === "three") {
        return <VFXDeclarativeThreePassMount effect={effect} order={order} />;
    } else {
        throw new Error(`VFX effect type ${effect.type} is not a valid declarative pass`);
    }
};

const VFXImpulseMount = ({ effect, order }: { effect: VFXEffect; order: number }) => {
    const spec = VFX_SPECS[effect.type];
    useImpulsePass(VFX_SHADERS[effect.type], spec, effect.binding, order);
    return null;
};

export const VFXPasses = () => {
    const stack = useVFXStore((s) => s.stack);

    let declarative_index = 0;
    let impulse_index = 0;

    return (
        <>
            {stack.map((effect, i) => {
                if (VFX_SPECS[effect.type].kind === "impulse") {
                    return (
                        <VFXImpulseMount
                            key={i}
                            effect={effect}
                            order={PASS_ORDER.impulse + impulse_index++}
                        />
                    );
                }

                return (
                    <VFXDeclarativeMount
                        key={i}
                        effect={effect}
                        order={PASS_ORDER.vfx_base + declarative_index++}
                    />
                );
            })}
        </>
    );
};
