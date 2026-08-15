import {useSetting} from "@hyperlinkvr/react";
import {Layer, LayerGroup} from "../render";
import {HUD_VR_DISTANCE, hud_vr_pixel_size, HUDSurface} from "./HUDSurface";
import {useMemo} from "react";

// should mount within origin
export const OriginHUD = () => {
    const [player_height_cm] = useSetting("player_height_cm");
    const hud_origin_anchor_height = useMemo(() => 0.85 * player_height_cm / 100, [player_height_cm]);

    return (
        <LayerGroup layers={[Layer.HUD]} position={[0, hud_origin_anchor_height, -HUD_VR_DISTANCE]}>
            <HUDSurface anchor="origin" pixel_size={hud_vr_pixel_size()} />
        </LayerGroup>
    );
}
