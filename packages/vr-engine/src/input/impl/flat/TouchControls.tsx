import { ArrowUpFromDot, Hand, Watch } from "lucide-react";
import { useCallback, useRef } from "react";



import { useFlatFrameInput, useFlatInputState } from "./bindings";
import { useHintState } from "./hints";


const WALK_THRESHOLD = 0.8;


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

    const sprint_timer = useRef<number | null>(null);

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

            const magnitude = Math.hypot(normalised_x, normalised_y);

            if (magnitude > WALK_THRESHOLD) {
                // circle proportion 0.8-1 = sprint 1
                // TODO: add some expression to the sprint speed

                const scale = 1 / magnitude;
                frame_input.move.x = normalised_x * scale;
                frame_input.move.y = normalised_y * scale;

                frame_input.sprint = true;
            } else {
                // circle proportion 0-0.8 = walk 0-1

                const factor = 1 / WALK_THRESHOLD;
                frame_input.move.x = normalised_x * factor;
                frame_input.move.y = normalised_y * factor;
                frame_input.sprint = false;
            }

            set_joy_pos(delta_x, delta_y);
        },
        [frame_input, set_joy_pos]
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
            className="relative rounded-full border-2 border-white/30 bg-white/5 flex items-center justify-center aspect-square w-[175px] pointer-events-auto"

            onPointerDown={handle_pointermove}
            onPointerMove={handle_pointermove}
            onPointerUp={handle_touchend}
        >
            <div
                ref={joy_ref}
                className="absolute rounded-full bg-white/30 flex items-center justify-center aspect-square w-[85px] pointer-events-none"
            />
        </div>
    )
}

const ActionButton = ({
    index = 0,
    direction = "right",
    small = false,
    children,
    on_down,
    on_up,
    title
}: {
    index?: number;
    direction?: "left" | "right";
    small?: boolean;
    children: React.ReactNode;
    on_down?: () => void;
    on_up?: () => void;
    title?: string;
}) => (
    <button
        className={`bg-gray-600/40 ${small ? "w-[40px]" : "w-[75px]"} aspect-square rounded-full flex items-center justify-center text-white pointer-events-auto`}
        style={{
            marginRight: direction === "right" ? `${index * 50}px` : 0,
            marginLeft: direction === "left" ? `${index * 50}px` : 0
        }}
        onPointerDown={on_down}
        onPointerUp={on_up}
        onContextMenu={(e) => e.preventDefault()}
        title={title}
    >
        {children}
    </button>
);

const ControlContainer = ({children, className}: {children: React.ReactNode, className?: string}) => (
    <div className={`w-full fixed px-[36px] z-2 pointer-events-none flex items-end justify-between ${className}`}>
        {children}
    </div>
);

export const TouchControls = () => {
    const frame_input = useFlatFrameInput();
    const state_input = useFlatInputState();

    const {device} = useHintState();

    if (device !== "touch") {
        return null;
    }

    return (
        <>
            <ControlContainer className="top-[calc(env(safe-area-inset-top,0px)+36px)]">
                <ActionButton small on_up={() => state_input.set_watch_presented(!state_input.watch_presented)} title="Toggle watch">
                    <Watch />
                </ActionButton>
            </ControlContainer>

            <ControlContainer className="bottom-[calc(env(safe-area-inset-bottom,0px)+36px)]">
                <TouchJoystick />

                <div className="flex flex-col gap-[25px] justify-end items-end">
                    <ActionButton index={1} on_down={() => frame_input.grab = true} on_up={() => frame_input.grab = false} title="Grab / Release">
                        <Hand />
                    </ActionButton>

                    <ActionButton index={0} on_down={() => frame_input.jump = true} on_up={() => frame_input.jump = false} title="Jump">
                        <ArrowUpFromDot />
                    </ActionButton>
                </div>
            </ControlContainer>
        </>
    );
}

// TODO: use and throw buttons when item held
// TODO: should grabbing always be sticky on touch?
