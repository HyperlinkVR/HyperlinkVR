import { GrayscalePass } from "./Grayscale";
import { ScreenShakePass } from "./ScreenShake";

export const VFXPasses = () => {
    return (
        <>
            <ScreenShakePass />
            <GrayscalePass enabled={false} />
        </>
    )
}
