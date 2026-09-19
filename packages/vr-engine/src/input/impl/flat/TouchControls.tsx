import { useCallback, useEffect, useRef } from "react";



import { useFlatFrameInput, useFlatInputState } from "./bindings";
import { useHintState } from "./hints";


const TouchJoystick = () => {
    const frame_input = useFlatFrameInput();

    const circle_ref = useRef<HTMLDivElement>(null);
    const joy_ref = useRef<HTMLDivElement>(null);

    const recenter = useCallback(
        () => {
            const joy = joy_ref.current;
            if (!joy) return;

            joy.style.transform = "";
        },
        []
    );

    const set_joy_pos = useCallback(
        (x: number, y: number) => {
            const joy = joy_ref.current;
            if (!joy) return;

            joy.style.transform = `translate(${x}px, ${y}px)`;
        },
        []
    );

    const handle_pointermove = useCallback(
        (e: React.PointerEvent) => {
            if (e.pointerType === "mouse") return;

            const circle = circle_ref.current;
            if (!circle) return;

            const rect = circle.getBoundingClientRect();

            const center_x = rect.left + rect.width / 2;
            const center_y = rect.top + rect.height / 2;

            let delta_x = e.clientX - center_x;
            let delta_y = e.clientY - center_y;

            const max_radius = rect.width / 2;
            const distance = Math.hypot(delta_x, delta_y);

            if (distance > max_radius) {
                const angle = Math.atan2(delta_y, delta_x);
                delta_x = Math.cos(angle) * max_radius;
                delta_y = Math.sin(angle) * max_radius;
            }

            const normalised_x = delta_x / max_radius;
            const normalised_y = -(delta_y / max_radius);

            frame_input.move.x = normalised_x;
            frame_input.move.y = normalised_y;

            set_joy_pos(delta_x, delta_y);
        },
        [frame_input.move, set_joy_pos]
    );

    const handle_touchend = useCallback(
        () => {
            frame_input.move.x = 0;
            frame_input.move.y = 0;

            recenter();
        },
        [frame_input.move, recenter]
    );

    return (
        <div
            ref={circle_ref}
            className="relative rounded-full border-2 border-white/30 bg-white/5 flex items-center justify-center aspect-square w-50 pointer-events-auto"

            onPointerDown={handle_pointermove}
            onPointerMove={handle_pointermove}
            onPointerUp={handle_touchend}
        >
            <div
                ref={joy_ref}
                className="absolute rounded-full bg-white/30 flex items-center justify-center aspect-square w-20 pointer-events-none"
            />
        </div>
    )
}

export const TouchControls = () => {
    const state_input = useFlatInputState();

    const {device} = useHintState();

    if (device !== "touch") {
        return null;
    }

    return (
        <div className="w-full h-full fixed inset-0 z-2 pointer-events-none">
            <div className="absolute bottom-10 left-10">
                <TouchJoystick />
            </div>
        </div>
    )
}
