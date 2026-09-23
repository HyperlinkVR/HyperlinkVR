import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { useRef } from "react";

import { useSystemInputStore } from "../../system_input";
import { useSetting } from "@hyperlinkvr/react";

const TOP_BUTTON = { left: "y-button", right: "b-button" } as const;

const is_pressed = (controller: ReturnType<typeof useXRInputSourceState>, code: string): boolean =>
    Boolean(controller && "gamepad" in controller && controller.gamepad?.[code]?.state === "pressed");

export const XRSystemInput = () => {
    const [watch_hand_setting] = useSetting("watch_hand");

    const watch_hand = watch_hand_setting ?? "left";
    const other_hand = watch_hand === "left" ? "right" : "left";

    const watch_controller = useXRInputSourceState("controller", watch_hand);
    const other_controller = useXRInputSourceState("controller", other_hand);

    const set_quick_menu_held = useSystemInputStore((state) => state.set_quick_menu_held);
    const fire_watch_detach = useSystemInputStore((state) => state.fire_watch_detach);

    const detach_was_pressed = useRef(false);

    // quick menu is the top button on the non-watch hand, watch detach is the top button on the watch hand
    useFrame(() => {
        set_quick_menu_held(is_pressed(other_controller, TOP_BUTTON[other_hand]));

        const detach_pressed = is_pressed(watch_controller, TOP_BUTTON[watch_hand]);
        if (detach_pressed && !detach_was_pressed.current) {
            fire_watch_detach();
        }
        detach_was_pressed.current = detach_pressed;
    });

    return null;
};
