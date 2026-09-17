import { useSessionMode } from "@hyperlinkvr/react";
import { useFrame } from "@react-three/fiber";
import { Container, Text, Fullscreen } from "@react-three/uikit";
import { ArrowLeft, Camera, Smile } from "@react-three/uikit-lucide";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Group, Vector3 } from "three";



import { PlayerExpression, usePlayerExpression } from "../contexts";
import { GadgetName, usePlayerGadgets } from "../contexts/PlayerGadgetsContext";
import { useXRHandAttachment } from "../input/impl/xr/useXRHandAttachment";
import { useQuickMenuHeld } from "../input/system_input";


const DIST = 45;

const OFFSETS = [
    { x: 0, y: -DIST }, // up
    { x: 0, y: DIST }, // down
    { x: -DIST, y: 0 }, // left
    { x: DIST, y: 0 } // right
] as const;

interface BaseSlot {
    icon: React.ReactNode,
    stay_open?: boolean
}

type SlotAction =
    | { gadget: GadgetName }
    | { expression: PlayerExpression }
    | { on_select: () => void };

type Slot = (BaseSlot & SlotAction) | (Omit<BaseSlot, "stay_open"> & { page: Page | null }) | null;

type Page = { slots: [Slot, Slot, Slot, Slot] };

type QuickMenuHandle = { select: (i: number) => void };
const SELECT_RADIUS = 0.06;
const REARM_RADIUS = 0.03;

// which quadrant a menu-local xy offset points at: up=0 down=1 left=2 right=3
const direction_index = (x: number, y: number) =>
    Math.abs(x) > Math.abs(y) ? (x > 0 ? 3 : 2) : (y > 0 ? 0 : 1);


const expression_page: Page = {
    // TODO: expression menu (move from the test menu)
    slots: [
        { icon: <Text>:D</Text>, expression: { eyes: "default", mouth: "big_smile" } },
        { icon: <ArrowLeft />, page: null },
        { icon: <Text>:{"{"}</Text>, expression: { eyes: "default", mouth: "wobbly_frown" } },
        null
    ]
};

const root: Page = {
    slots: [
        { icon: <Smile />, page: expression_page },
        { icon: <Camera />, gadget: "camera" },
        null,
        null
    ]
};

// TODO: set icon size so it scales properly on flat (will need to adjust pixelsize)
// TODO: replace the click on flat with mouse hovering?
// TODO: free cursor when open
// TODO: controller stick input for flat

const QuickMenuItems = ({ controls, active_index, on_page_changed }: {
    controls?: RefObject<QuickMenuHandle | null>;
    active_index?: number | null;
    on_page_changed?: (page: Page) => void;
}) => {
    const [current_page, setCurrentPage] = useState(root);

    const {respawn_gadget} = usePlayerGadgets();
    const {dispatch_expression} = usePlayerExpression();

    const [self_dismiss, setSelfDismiss] = useState(false);

    const on_slot = (slot: Slot) => {
        if (!slot) return;

        if ("page" in slot) {
            // null page = root
            const page = slot.page || root;

            setCurrentPage(page);
            on_page_changed?.(page);
        } else if ("gadget" in slot) {
            respawn_gadget(slot.gadget);
        } else if ("expression" in slot) {
            dispatch_expression(slot.expression);
        } else if ("on_select" in slot) {
            slot.on_select();
        }

        // page changes automatically stay open, other slots have to opt in
        if (!("page" in slot) && !slot.stay_open) {
            setSelfDismiss(true);
        }
    };

    useEffect(() => {
        if (!controls) return;
        controls.current = { select: (i) => on_slot(current_page.slots[i]!) };
    });

    if (self_dismiss) {
        return null;
    }

    return (
        <Container width={200} height={200} positionType="relative" color="white">
            {current_page.slots.map((slot, i) =>
                slot && (
                    <Container
                        key={i}
                        positionType="absolute"
                        inset={0}
                        alignItems="center"
                        justifyContent="center"
                        transformTranslateX={OFFSETS[i]!.x}
                        transformTranslateY={OFFSETS[i]!.y}
                        transformScaleX={active_index === i ? 1.3 : 1}
                        transformScaleY={active_index === i ? 1.3 : 1}
                        onPointerDown={controls ? undefined : () => on_slot(slot)}
                    >
                        {slot.icon}
                    </Container>
                )
            )}
        </Container>
    );
};


const VRQuickMenu = () => {
    const { AnchorSpace, get_hand_world_pos } = useXRHandAttachment({
        hand: "non_watch_hand"
    });

    const group_ref = useRef<Group>(null);
    const needs_placing = useRef(true);
    const armed = useRef(true);
    const scratch = useMemo(() => new Vector3(), []);
    const controls = useRef<QuickMenuHandle | null>(null);
    const [active_index, set_active_index] = useState<number | null>(null);

    useFrame(() => {
        if (!group_ref.current) return;

        const is_tracked = get_hand_world_pos(scratch);
        if (!is_tracked) return;

        // on spawn, or after navigating, recentre the menu on the controller
        if (needs_placing.current) {
            group_ref.current.parent?.worldToLocal(scratch);
            group_ref.current.position.copy(scratch);
            needs_placing.current = false;
            armed.current = true;
            set_active_index(null);
            return;
        }

        // how far, and in which direction, has the controller pushed from centre?
        group_ref.current.worldToLocal(scratch);
        const dist = Math.hypot(scratch.x, scratch.y);

        if (dist < REARM_RADIUS) {
            armed.current = true;
            set_active_index(null);
            return;
        }

        const i = direction_index(scratch.x, scratch.y);
        set_active_index(i);

        if (armed.current && dist > SELECT_RADIUS) {
            armed.current = false;

            // select the active slot
            controls.current?.select(i);
        }
    });

    return (
        <>
            <AnchorSpace />

            <group ref={group_ref}>
                <Container pixelSize={0.0025}>
                    <QuickMenuItems
                        controls={controls}
                        active_index={active_index}
                        on_page_changed={() => (needs_placing.current = true)}
                    />
                </Container>
            </group>
        </>
    );
};

const FlatQuickMenu = () => {
    // TODO: fullscreen presentation with mouse freed/gamepad stick?
    return (
        <Fullscreen alignItems="center" justifyContent="center" depthWrite={false} depthTest={false}>
            <QuickMenuItems />;
        </Fullscreen>
    )
};

export const QuickMenu = () => {
    const visible = useQuickMenuHeld();
    const mode = useSessionMode();

    if (!visible) {
        return null;
    }

    if (mode === "vr") {
        return <VRQuickMenu />;
    } else {
        return <FlatQuickMenu />;
    }
}
