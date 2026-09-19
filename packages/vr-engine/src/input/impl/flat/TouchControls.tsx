import { useFlatFrameInput, useFlatInputState } from "./bindings";
import { useHintState } from "./hints";


export const TouchControls = () => {
    const frame_input = useFlatFrameInput();
    const state_input = useFlatInputState();

    const {device} = useHintState();

    if (device !== "touch") {
        return null;
    }

    return (
        <div className="w-full h-full fixed inset-0 z-2">
            TODO
        </div>
    )
}
