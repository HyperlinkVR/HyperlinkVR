import { useThree } from "@react-three/fiber";
import { useEffect } from "react";



import { useAudioListener } from "../contexts/AudioListenerContext";
import { useWorldLoadingStateStore } from "../stores/WorldLoadingStateStore";
import { get_united_head_camera } from "../util/get_head_cameras";
import { compute_layer_mask, Layer } from "./layers";


const world_layer_mask = compute_layer_mask([
    Layer.Default,
    Layer.PlayerModel_TorsoAndHands,
    Layer.ThirdPerson_ForceHide,
    Layer.Vignette,
    Layer.HUD,
    Layer.NoVFX
]);

// while loading, the world isnt rendered, only the loader
const loader_layer_mask = compute_layer_mask([
    Layer.Loader
]);

export const CameraSetup = () => {
    const { gl, camera } = useThree();
    const listener = useAudioListener();
    const loading = useWorldLoadingStateStore((store) => store.loading);

    useEffect(() => {
        const head_camera = get_united_head_camera(gl, camera);
        head_camera.add(listener);

        const layer_mask = loading ? loader_layer_mask : world_layer_mask;

        const set_layers = () => {
            head_camera.layers.mask = layer_mask;
        };

        // set immediately in case remounted in vr, but listen for sessionstart to cover both cameras when vr starts
        // for flat, this will never matter so can safely set the listeners
        set_layers();
        gl.xr.addEventListener("sessionstart", set_layers);

        return () => {
            gl.xr.removeEventListener("sessionstart", set_layers);
            head_camera.remove(listener);
        };
    }, [gl, camera, listener, loading]);

    return null;
}

export const shadow_camera_layer_mask = compute_layer_mask([
    Layer.Default,
    Layer.PlayerModel_Head,
    Layer.PlayerModel_TorsoAndHands,
    Layer.ThirdPerson_ForceHide
]);
