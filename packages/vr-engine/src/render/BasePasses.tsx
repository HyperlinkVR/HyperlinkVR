import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { Camera, Scene, WebGLRenderer, WebGLRenderTarget } from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";



import { PASS_ORDER, usePass } from "./GraphicsPipeline";
import { Layer } from "./layers";


export const SceneRenderPass = () => {
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);

    const pass = useMemo(() => {
        const render_pass = new RenderPass(scene, camera);
        const original_render = render_pass.render.bind(render_pass);

        render_pass.render = (
            renderer: WebGLRenderer,
            writeBuffer: WebGLRenderTarget,
            readBuffer: WebGLRenderTarget,
            deltaTime: number,
            maskActive: boolean
        ) => {
            // exclude NoVFX layer for this pass, it'll be overlaid after the vfx pipeline (but before quality passes)
            const current_mask = camera.layers.mask;
            camera.layers.disable(Layer.NoVFX);

            original_render(
                renderer,
                writeBuffer,
                readBuffer,
                deltaTime,
                maskActive
            );

            camera.layers.mask = current_mask;
        };

        return render_pass;
    }, [scene, camera]);

    usePass(pass, PASS_ORDER.render);
    return null;
};

class NoVFXBufferOverlayPass extends Pass {
    constructor(
        private scene: Scene,
        private camera: Camera
    ) {
        super();
        (this as any).needsSwap = false;
    }

    render(
        renderer: WebGLRenderer,
        _writeBuffer: WebGLRenderTarget,
        readBuffer: WebGLRenderTarget
    ) {
        const current_mask = this.camera.layers.mask;
        const current_auto_clear = renderer.autoClear;
        const current_background = this.scene.background;
        renderer.autoClear = false;
        this.scene.background = null;

        renderer.setRenderTarget(readBuffer);
        // depth buffer is preserved so novfx objects still respect depth
        this.camera.layers.set(Layer.NoVFX);
        renderer.render(this.scene, this.camera);

        renderer.autoClear = current_auto_clear;
        this.scene.background = current_background;
        this.camera.layers.mask = current_mask;
    }
}

export const NoVFXBufferOverlayRenderPass = () => {
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);

    const pass = useMemo(
        () => new NoVFXBufferOverlayPass(scene, camera),
        [scene, camera]
    );

    // runs after all vfx but before quality passes
    usePass(pass, PASS_ORDER.quality - 1);
    return null;
};

