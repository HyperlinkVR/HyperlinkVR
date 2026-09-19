import { useSetting } from "@hyperlinkvr/react";
import { useEffect, useState } from "react";


import { useQuickMenuHeld } from "../../system_input";
import { useFlatInputState } from "./bindings";


export const Crosshair = () => {
    const {cursor_free} = useFlatInputState();
    const quick_menu_open = useQuickMenuHeld();
    const [devtools_photo_mode] = useSetting("devtools_flat_photo_mode");

    const [visible, setVisible] = useState(true);
    

    useEffect(() => {
        setVisible(cursor_free || quick_menu_open || devtools_photo_mode);
    }, [cursor_free, quick_menu_open, devtools_photo_mode]);

    if (!visible) {
        return null;
    }

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-25">
            <div className="w-2 h-2 bg-white/75 rounded-full border-1 border-black/25" />
        </div>
    );
}
