import { useThree } from "@react-three/fiber";
// type-only: no runtime dependency on `postprocessing`. Anything shaped like a
// pmndrs Pass (EffectPass, SSGIPass, TRAAPass, ...) can be wrapped.
import type { Pass as PmndrsPass } from "postprocessing";
import { useEffect, useMemo, type DependencyList } from "react";
import { HalfFloatType } from "three";
import type { Camera, Scene, Texture, WebGLRenderer, WebGLRenderTarget } from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass";



import { usePass } from "./GraphicsPipeline";


/**
 * Wraps a pmndrs `postprocessing` Pass so it satisfies the three.js
 * postprocessing Pass interface consumed by `WebGLRenderer.setEffects()` /
 * the native output pipeline.
 *
 * It reconciles the two interface mismatches:
 *   1. Buffer argument order is swapped.
 *        three:  render(renderer, writeBuffer, readBuffer, ...)   // reads arg2, writes arg1
 *        pmndrs: render(renderer, inputBuffer,  outputBuffer, ...)// reads arg1, writes arg2
 *   2. pmndrs has a lifecycle three never calls: `initialize`,
 *      `mainScene`/`mainCamera`, `setDepthTexture`.
 *
 * Place it AFTER your `SceneRenderPass` in the chain (the pipeline still
 * requires a three RenderPass as the first effect to draw the scene).
 *
 * DEPTH CAVEAT: a pmndrs pass with `needsDepthTexture === true` only works if
 * the incoming buffer actually carries a `.depthTexture`. three's output
 * pipeline buffers do not by default, so depth/G-buffer effects need a depth
 * texture supplied to them another way. Pure per-pixel colour passes work as-is.
 */
export class PmndrsPassAdapter extends Pass {
    private readonly _pass: PmndrsPass;
    private _initialized = false;

    scene: Scene | null;
    camera: Camera | null;

    constructor(pass: PmndrsPass, scene?: Scene, camera?: Camera) {
        super();
        this._pass = pass;
        this.scene = scene ?? null;
        this.camera = camera ?? null;

        // mirror the wrapped pass's swap behaviour so the output pipeline
        // ping-pongs correctly; make sure we are NOT treated as the scene pass.
        this.needsSwap =
            (pass as unknown as { needsSwap?: boolean }).needsSwap ?? true;
        (this as unknown as { isRenderPass: boolean }).isRenderPass = false;
    }

    /** The wrapped pmndrs pass, e.g. to tweak uniforms at runtime. */
    get pass(): PmndrsPass {
        return this._pass;
    }

    override setSize(width: number, height: number): void {
        // pmndrs setSize is safe to call before initialize (it just stores the
        // resolution / resizes internal targets if they exist yet).
        (
            this._pass as unknown as {
                setSize?: (w: number, h: number) => void;
            }
        ).setSize?.(width, height);
    }

    override render(
        renderer: WebGLRenderer,
        writeBuffer: WebGLRenderTarget,
        readBuffer: WebGLRenderTarget,
        deltaTime?: number,
        _maskActive?: boolean
    ): void {
        const p = this._pass as unknown as {
            initialize?: (
                r: WebGLRenderer,
                alpha: boolean,
                frameBufferType: number
            ) => void;
            render: (
                r: WebGLRenderer,
                inputBuffer: WebGLRenderTarget,
                outputBuffer: WebGLRenderTarget,
                deltaTime: number,
                stencilTest: boolean
            ) => void;
            mainScene?: Scene;
            mainCamera?: Camera;
            scene?: Scene;
            camera?: Camera;
            needsDepthTexture?: boolean;
            setDepthTexture?: (t: Texture) => void;
        };

        if (!this._initialized) {
            const alpha = renderer.getContextAttributes()?.alpha ?? false;
            // match the output pipeline's HDR buffer precision
            p.initialize?.(renderer, alpha, HalfFloatType);
            this._initialized = true;
        }

        // hand the pmndrs pass its scene/camera every frame — the camera ref can
        // change (e.g. entering XR swaps in the ArrayCamera).
        if (this.scene) {
            if ("mainScene" in p) p.mainScene = this.scene;
            else p.scene = this.scene;
        }
        if (this.camera) {
            if ("mainCamera" in p) p.mainCamera = this.camera;
            else p.camera = this.camera;
        }

        // forward a depth texture only if both the pass wants one and the buffer
        // carries one (see DEPTH CAVEAT above).
        const depthTexture = (
            readBuffer as unknown as { depthTexture?: Texture }
        ).depthTexture;
        if (p.needsDepthTexture && depthTexture) {
            p.setDepthTexture?.(depthTexture);
        }

        // three read=readBuffer / write=writeBuffer  ->  pmndrs input / output
        p.render(renderer, readBuffer, writeBuffer, deltaTime ?? 0, false);
    }

    override dispose(): void {
        (this._pass as unknown as { dispose?: () => void }).dispose?.();
    }
}

/**
 * Registers a pmndrs `postprocessing` pass into the {@link GraphicsPipeline},
 * ordered by JSX position like any other pass.
 *
 * @example
 * import { EffectPass } from "postprocessing";
 * import { SSGIEffect } from "realism-effects";
 *
 * const SSGIPass = () => {
 *     usePmndrsPass((scene, camera) => {
 *         const ssgi = new SSGIEffect(scene, camera);
 *         return new EffectPass(camera, ssgi);
 *     });
 *     return null;
 * };
 */
export const usePmndrsPass = (
    factory: (scene: Scene, camera: Camera) => PmndrsPass,
    deps: DependencyList = [],
    order_band?: number
): PmndrsPassAdapter => {
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);

    const adapter = useMemo(
        () => new PmndrsPassAdapter(factory(scene, camera), scene, camera),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        deps
    );

    // keep the adapter's scene/camera fresh without rebuilding the pass.
    useEffect(() => {
        adapter.scene = scene;
        adapter.camera = camera;
    }, [adapter, scene, camera]);

    usePass(adapter, order_band);

    useEffect(() => () => adapter.dispose(), [adapter]);

    return adapter;
};
