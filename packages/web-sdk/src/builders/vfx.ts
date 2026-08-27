import { VFX_SPECS, VFXStackSchema } from "@hyperlinkvr/vr-engine-schemas";
import type { BadTVEffectInput, FilmEffectInput, GrayscaleEffectInput, RGBShiftEffectInput, ScreenShakeEffectInput, StaticEffectInput, VFXEffectInput, VFXStack } from "@hyperlinkvr/vr-engine-schemas";



import { send_via_rtc } from "../messenger";
import { BaseBuilder } from "./base";
import type { BindingHost, BindingMap } from "./triggers";


const vfx_command = async (binding_id: string, command: string, args?: Record<string, unknown>) => {
    const res = await send_via_rtc({
        action: "HVRSDK_VFX_COMMAND",
        binding_id,
        command,
        args
    });

    if (!res || !res.success) {
        throw new Error(res?.error ?? `VFX command "${command}" failed`);
    }

    return res.response;
};

// fire an impulse effect (e.g. a screen shake)
/** @group VFX */
export interface VFXImpulseControl {
    pulse(args?: { magnitude?: number } & Record<string, unknown>): Promise<void>;
}

// change a declarative effect live, without re-applying the whole stack
/** @group VFX */
export interface VFXDeclarativeControl {
    set(params: Record<string, number>): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
    toggle(): Promise<void>;
}

/** @group VFX */
export type VFXEffectControl = VFXImpulseControl | VFXDeclarativeControl;

// the runtime handle returned by VFXStackBuilder.apply(). this is the ONLY place the
// pulse / update / binding surface exists — you can't touch it before dispatch, and a
// builder can be applied more than once (each apply mints fresh binding ids). mirrors
// how EngineObjectDispatchBuilder.create() returns a handle rather than exposing
// runtime ops on the builder itself.
/** @group VFX */
export interface AppliedVFXStack extends BindingHost {
    readonly stack: VFXStack;
    // named effects only, keyed by the name given at build time
    readonly effects: Record<string, VFXEffectControl>;
    readonly bindings: BindingMap;
    // remove all post-processing
    clear(): Promise<void>;
}

const make_impulse_control = (binding_id: string): VFXImpulseControl => ({
    pulse: (args) => vfx_command(binding_id, "pulse", args).then(() => undefined)
});

const make_declarative_control = (binding_id: string): VFXDeclarativeControl => ({
    set: (params) => vfx_command(binding_id, "set", params).then(() => undefined),
    enable: () => vfx_command(binding_id, "enable").then(() => undefined),
    disable: () => vfx_command(binding_id, "disable").then(() => undefined),
    toggle: () => vfx_command(binding_id, "toggle").then(() => undefined)
});

/** @group VFX */
export class VFXStackBuilder extends BaseBuilder<VFXEffectInput[]> {
    constructor() {
        super([]);
    }

    add(effect: VFXEffectInput) {
        this._internal.push(effect);
        return this;
    }

    grayscale(params: Omit<GrayscaleEffectInput, "type" | "binding"> = {}, name?: string) {
        this._internal.push({ type: "grayscale", ...(name ? { binding: { name } } : {}), ...params });
        return this;
    }

    rgb_shift(params: Omit<RGBShiftEffectInput, "type" | "binding"> = {}, name?: string) {
        this._internal.push({ type: "rgb-shift", ...(name ? { binding: { name } } : {}), ...params });
        return this;
    }

    bad_tv(params: Omit<BadTVEffectInput, "type" | "binding"> = {}, name?: string) {
        this._internal.push({ type: "bad-tv", ...(name ? { binding: { name } } : {}), ...params });
        return this;
    }

    static_noise(params: Omit<StaticEffectInput, "type" | "binding"> = {}, name?: string) {
        this._internal.push({ type: "static", ...(name ? { binding: { name } } : {}), ...params });
        return this;
    }

    film(params: Omit<FilmEffectInput, "type" | "binding"> = {}, name?: string) {
        this._internal.push({ type: "film", ...(name ? { binding: { name } } : {}), ...params });
        return this;
    }

    screen_shake(name: string, params: Omit<ScreenShakeEffectInput, "type" | "binding"> = {}) {
        this._internal.push({ type: "screen-shake", binding: { name }, ...params });
        return this;
    }

    build(): VFXStack {
        return VFXStackSchema.parse(this._internal);
    }

    async apply(): Promise<AppliedVFXStack> {
        const stack = this.build();

        // mint a binding id per named effect, at dispatch (not on the builder), and
        // stamp it into the outgoing data
        const bindings = new Map<string, string>();
        for (const effect of stack) {
            const name = effect.binding?.name;
            if (!name) continue;
            if (bindings.has(name)) {
                throw new Error(`Duplicate VFX effect name "${name}" in this stack.`);
            }
            const id = crypto.randomUUID();
            effect.binding = { ...effect.binding, id };
            bindings.set(name, id);
        }

        const res = await send_via_rtc({ action: "HVRSDK_SET_VFX", stack });
        if (!res || !res.success) {
            throw new Error(res?.error ?? "Failed to apply VFX stack");
        }

        const effects: Record<string, VFXEffectControl> = {};
        for (const effect of stack) {
            const name = effect.binding?.name;
            const id = effect.binding?.id;
            if (!name || !id) continue;
            effects[name] = VFX_SPECS[effect.type].kind === "impulse"
                ? make_impulse_control(id)
                : make_declarative_control(id);
        }

        return {
            stack,
            effects,
            bindings,
            // TODO: make it more clear the vfx stack is a singleton
            clear: async () => {
                const cleared = await send_via_rtc({ action: "HVRSDK_SET_VFX", stack: [] });
                if (!cleared || !cleared.success) {
                    throw new Error(cleared?.error ?? "Failed to clear VFX stack");
                }
            }
        };
    }
}

// TODO: player targeting
// TODO: impulse arguments (magnitude, duration, etc)
