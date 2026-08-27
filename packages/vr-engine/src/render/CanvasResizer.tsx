import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

export const CanvasResizer = ({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) => {
    const { gl } = useThree();
    const last_size_ref = useRef<{ width: number; height: number } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const apply_size = (width: number, height: number) => {
            last_size_ref.current = { width, height };

            if (gl.xr.isPresenting) {
                // cant setSize while xr presenting, so resize the spectator drawing buffer directly
                const pixel_ratio = gl.getPixelRatio();
                gl.domElement.width = Math.floor(width * pixel_ratio);
                gl.domElement.height = Math.floor(height * pixel_ratio);
                gl.domElement.style.width = `${width}px`;
                gl.domElement.style.height = `${height}px`;

                gl.setViewport(0, 0, width, height);
            } else {
                gl.setSize(width, height);
                gl.domElement.style.width = `${width}px`;
                gl.domElement.style.height = `${height}px`;
            }
        };

        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry!.contentRect;
            apply_size(width, height);
        });

        observer.observe(containerRef.current);

        // xr session end reverts canvas size, so make sure to then reapply it
        const handle_session_end = () => {
            requestAnimationFrame(() => {
                const size = last_size_ref.current;
                if (!size) return;
                gl.setSize(size.width, size.height);
                gl.domElement.style.width = `${size.width}px`;
                gl.domElement.style.height = `${size.height}px`;
            });
        };

        gl.xr.addEventListener("sessionend", handle_session_end);

        return () => {
            observer.disconnect();
            gl.xr.removeEventListener("sessionend", handle_session_end);
        };
    }, [gl, containerRef]);

    return null;
};
