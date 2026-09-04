// import { useFlatInputState } from "./bindings";

import { useEffect, useState } from "react";
import { useSetting } from "@hyperlinkvr/react";

export const Crosshair = () => {
    // annoying to manage provider for this, just read from dom instead
    // const {cursor_free} = useFlatInputState();
    //
    // if (cursor_free) {
    //     return null;
    // }

    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const handle_pointer_lock_change = () => {
            const is_locked = document.pointerLockElement !== null;
            setVisible(is_locked);
        };

        document.addEventListener("pointerlockchange", handle_pointer_lock_change);
        handle_pointer_lock_change();

        return () => {
            document.removeEventListener("pointerlockchange", handle_pointer_lock_change);
        };
    }, []);

    const [devtools_photo_mode] = useSetting("devtools_flat_photo_mode");
    if (devtools_photo_mode) return null;

    if (!visible) {
        return null;
    }

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-25">
            <div className="w-2 h-2 bg-white/75 rounded-full border-1 border-black/25" />
        </div>
    );
}
