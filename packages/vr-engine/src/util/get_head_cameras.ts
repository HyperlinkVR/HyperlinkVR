import type { Camera, WebGLRenderer } from "three";

export const get_head_cameras = (gl: WebGLRenderer, fallback: Camera) => {
    return gl.xr.isPresenting ? gl.xr.getCamera().cameras : [fallback];
}

export const get_united_head_camera = (gl: WebGLRenderer, fallback: Camera) => {
    return gl.xr.isPresenting ? gl.xr.getCamera() : fallback;
}
