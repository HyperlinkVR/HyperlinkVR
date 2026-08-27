import type { ThreeEvent } from "@react-three/fiber";
import type { ComponentProps} from "react";
import { useCallback, useEffect, useState } from "react";
import { CanvasTexture, Color, DoubleSide, SRGBColorSpace } from "three";





// generate spectrum texture once at import and share between all ColorPicker instances
const spectrum_texture = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;

    const hue_gradient = ctx.createLinearGradient(0, 0, 256, 0);
    hue_gradient.addColorStop(0, "hsl(0, 100%, 50%)");
    hue_gradient.addColorStop(0.17, "hsl(60, 100%, 50%)");
    hue_gradient.addColorStop(0.33, "hsl(120, 100%, 50%)");
    hue_gradient.addColorStop(0.5, "hsl(180, 100%, 50%)");
    hue_gradient.addColorStop(0.67, "hsl(240, 100%, 50%)");
    hue_gradient.addColorStop(0.83, "hsl(300, 100%, 50%)");
    hue_gradient.addColorStop(1, "hsl(360, 100%, 50%)");
    ctx.fillStyle = hue_gradient;
    ctx.fillRect(0, 0, 256, 256);

    const lightness_gradient = ctx.createLinearGradient(0, 0, 0, 256);
    lightness_gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    lightness_gradient.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    lightness_gradient.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    lightness_gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = lightness_gradient;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
})();

interface ColorPickerProps extends ComponentProps<"group"> {
    color?: number;
    on_color_change?: (color: number) => void;
}

export const ColorPicker = ({
    color,
    on_color_change,
    ...props
}: ColorPickerProps) => {
    const [cursor_pos, setCursorPos] = useState<[number, number, number]>([0, 0, 0.01]);
    const [is_dragging, setIsDragging] = useState(false);

    // set cursor position based on controllerd color prop if present
    useEffect(() => {
        if (color !== undefined) {
            const c = new Color(color);
            const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
            setCursorPos([hsl.h - 0.5, hsl.l - 0.5, 0.01]);
        }
    }, [color]);

    const handle_pointer = useCallback(
        (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            if (!e.uv) return;

            const new_color = new Color().setHSL(e.uv.x, 1.0, e.uv.y);
            if (on_color_change) on_color_change(new_color.getHex());

            setCursorPos([e.uv.x - 0.5, e.uv.y - 0.5, 0.01]);
        },
        [on_color_change]
    );

    return (
        <group {...props}>
            <mesh
                onPointerDown={(e) => {
                    setIsDragging(true);
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    handle_pointer(e);
                }}
                onPointerMove={(e) => {
                    if (is_dragging) handle_pointer(e);
                }}
                onPointerUp={(e) => {
                    setIsDragging(false);
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                }}>
                <planeGeometry args={[1, 1]} />

                <meshBasicMaterial
                    map={spectrum_texture}
                    side={DoubleSide}
                />
            </mesh>

            <mesh position={cursor_pos}>
                <ringGeometry args={[0.02, 0.03, 32]} />
                <meshBasicMaterial color="white" />
            </mesh>
        </group>
    );

    // TODO: not working on unfreed flat cursor?
}
