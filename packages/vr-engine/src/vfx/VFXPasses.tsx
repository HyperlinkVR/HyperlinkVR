import { VFX_SPECS, type VFXEffect } from "@hyperlinkvr/vr-engine-schemas";

import { PASS_ORDER } from "../render/GraphicsPipeline";
import { useVFXStore } from "../stores/VFXStore";
import { VFX_SHADERS } from "./shaders";
import { useImpulsePass } from "./useImpulsePass";
import { useShaderPass } from "./useShaderPass";


const VFXDeclarativeMount = ({ effect, order }: { effect: VFXEffect; order: number }) => {
    const spec = VFX_SPECS[effect.type];
    const { type: _type, enabled, binding, ...values } = effect;
    useShaderPass(VFX_SHADERS[effect.type], spec, values as Record<string, number>, enabled, order, binding);
    return null;
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
