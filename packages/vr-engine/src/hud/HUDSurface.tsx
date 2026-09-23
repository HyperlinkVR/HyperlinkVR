import { useAuthSession, useSetting } from "@hyperlinkvr/react";
import type { HUDSlot, HUDVRAnchor } from "@hyperlinkvr/vr-engine-schemas";
import { Container } from "@react-three/uikit";
import { Suspense, useMemo } from "react";



import type { ResolvedHUDElement as StoreResolvedHUDElement } from "../stores/HUDStore";
import { useHUDStore } from "../stores/HUDStore";
import { HUDComponentView } from "./components";

export const HUD_CANVAS_WIDTH = 1920;
export const HUD_CANVAS_HEIGHT = 1080;

// the vr hud is a rectangle constrained to an fov at a certain distance, so the ideal pixel values can be calculated in advance
export const HUD_VR_FOV = Math.PI / 3;
export const HUD_VR_DISTANCE = 0.5;
export const hud_vr_width = (distance = HUD_VR_DISTANCE) => 2 * distance * Math.tan(HUD_VR_FOV / 2);
export const hud_vr_pixel_size = (distance = HUD_VR_DISTANCE) => hud_vr_width(distance) / HUD_CANVAS_WIDTH;

// the head mounted hud should have a bit smaller fov so it doesnt go too far into peripheral vision
export const HUD_VR_HEAD_FOV = Math.PI / 3.5;
export const HUD_VR_HEAD_DISTANCE = 0.5;
export const hud_vr_head_width = (distance = HUD_VR_HEAD_DISTANCE) => 2 * distance * Math.tan(HUD_VR_HEAD_FOV / 2);
export const hud_vr_head_pixel_size = (distance = HUD_VR_HEAD_DISTANCE) => hud_vr_head_width(distance) / HUD_CANVAS_WIDTH;

const VERTICAL_JUSTIFY = {
    top: "flex-start",
    middle: "center",
    bottom: "flex-end"
} as const;

const HORIZONTAL_ALIGN = {
    left: "flex-start",
    center: "center",
    right: "flex-end"
} as const;

const VERTICALS = ["top", "middle", "bottom"] as const;
const HORIZONTALS = ["left", "center", "right"] as const;

const HUDElementView = ({element}: {element: StoreResolvedHUDElement}) => {
    if (element.offset) {
        const [offset_x, offset_y] = element.offset;

        // offset removes element from slot flow
        return (
            <Container
                //positionType="absolute"
                transformTranslateX={offset_x}
                transformTranslateY={offset_y}
            >
                <HUDComponentView element={element} />
            </Container>
        );
    }

    return (
        <Container>
            <HUDComponentView element={element} />
        </Container>
    );
};

const HUDSlotView = ({slot, elements}: {slot: HUDSlot; elements: StoreResolvedHUDElement[]}) => (
    <Container
        flexGrow={1}
        flexBasis={0}
        flexDirection="column"
        justifyContent={VERTICAL_JUSTIFY[slot.vertical]}
        alignItems={HORIZONTAL_ALIGN[slot.horizontal]}
    >
        {elements.map((element) => (
            <HUDElementView key={element.id} element={element} />
        ))}
    </Container>
);

export interface HUDSurfaceProps {
    // the anchor this surface represents (note that the caller is responsible for positioning, this is just a filter)
    anchor: HUDVRAnchor | null;
    pixel_size?: number;
    width?: number;
    height?: number;
}

export const HUDSurface = ({
    anchor,
    pixel_size = 1,
    width = HUD_CANVAS_WIDTH,
    height = HUD_CANVAS_HEIGHT
}: HUDSurfaceProps) => {
    // the local player's stable account id (matches SDK player.get_id() and the id engine events
    // carry); null for guests. this renderer only shows the local player's own hud.
    const id = useAuthSession()?.uuid ?? null;

    const elements = useHUDStore((state) => state.elements);

    const by_slot = useMemo(() => {
        const resolved = useHUDStore.getState().resolve_for(id, anchor);
        const grouped = new Map<string, StoreResolvedHUDElement[]>();

        for (const element of resolved) {
            const key = `${element.slot.vertical}-${element.slot.horizontal}`;
            const existing = grouped.get(key) ?? [];
            existing.push(element);
            grouped.set(key, existing);
        }

        return grouped;
    }, [elements, id, anchor]);

    const [devtools_photo_mode] = useSetting("devtools_flat_photo_mode");
    if (devtools_photo_mode) return null;

    return (
        <Suspense fallback={null}>
            <Container width={width} height={height} flexDirection="column" pixelSize={pixel_size} pointerEvents="none" depthTest={false} depthWrite={false}>
                {VERTICALS.map((vertical) => (
                    <Container key={vertical} flexGrow={1} flexBasis={0} flexDirection="row">
                        {HORIZONTALS.map((horizontal) => (
                            <HUDSlotView
                                key={horizontal}
                                slot={{vertical, horizontal}}
                                elements={by_slot.get(`${vertical}-${horizontal}`) ?? []}
                            />
                        ))}
                    </Container>
                ))}
            </Container>
        </Suspense>
    );
};
