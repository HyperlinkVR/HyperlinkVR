import {useEffect, useMemo} from "react";
import {Container, Text} from "@react-three/uikit";
import {
    HUDSlot,
    HUDVRAnchor,
} from "@hyperlinkvr/vr-engine-schemas";

import {useHUDStore, ResolvedHUDElement as StoreResolvedHUDElement} from "../stores/HUDStore";
import {mark_hud_element_ready} from "./hud_ready_registry";

export const HUD_CANVAS_WIDTH = 1920;
export const HUD_CANVAS_HEIGHT = 1080;

// the vr hud is a rectangle constrained to an fov at a certain distance, so the ideal pixel values can be calculated in advance
export const HUD_VR_FOV = Math.PI / 3;
export const HUD_VR_DISTANCE = 0.5;
export const hud_vr_width = (distance = HUD_VR_DISTANCE) => 2 * distance * Math.tan(HUD_VR_FOV / 2);
export const hud_vr_pixel_size = (distance = HUD_VR_DISTANCE) => hud_vr_width(distance) / HUD_CANVAS_WIDTH;

// the head mounted hud should have a much smaller fov so it doesnt go into peripheral vision
export const HUD_VR_HEAD_FOV = Math.PI / 5;
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

const HUDComponentView = ({element}: {element: StoreResolvedHUDElement}) => {
    useEffect(() => {
        mark_hud_element_ready(element.id);
    }, [element.id]);

    // TODO: replace this with calls to imported components when more are added for cleanliness, since text is just a test it can be inlined

    switch (element.component.type) {
        case "text":
            return (
                <Text
                    fontSize={element.component.font_size}
                    color={element.component.color}
                >
                    {element.component.text}
                </Text>
            );
        default:
            return null;
    }
};

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
    //const session = useAuthSession();
    //const username = useMemo(() => session?.username ?? null, [session]);
    // TODO: is this the right way to be doing multiplayer hud. i suppose details are hazy currently, perhaps this mechanism is for the p2p host and everyone else will always be local
    // actually, just pass null for local. we only want our own hud for the render
    const username = null;

    const elements = useHUDStore((state) => state.elements);

    const by_slot = useMemo(() => {
        const resolved = useHUDStore.getState().resolve_for(username, anchor);
        const grouped = new Map<string, StoreResolvedHUDElement[]>();

        for (const element of resolved) {
            const key = `${element.slot.vertical}-${element.slot.horizontal}`;
            const existing = grouped.get(key) ?? [];
            existing.push(element);
            grouped.set(key, existing);
        }

        return grouped;
    }, [elements, username, anchor]);

    return (
        <Container width={width} height={height} flexDirection="column" pixelSize={pixel_size} pointerEvents="none">
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
    );
};
