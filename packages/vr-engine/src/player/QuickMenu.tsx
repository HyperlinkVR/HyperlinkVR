import { useSessionMode } from "@hyperlinkvr/react";
import { useFrame, useThree } from "@react-three/fiber";
import { Container, Fullscreen, Text } from "@react-three/uikit";
import { ArrowLeft, Camera, Smile } from "@react-three/uikit-lucide";
import {
    ComponentRef,
    RefObject,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { Euler, Group, Quaternion, Vector3 } from "three";



import { PlayerExpression, usePlayerExpression } from "../contexts";
import { GadgetName, usePlayerGadgets } from "../contexts/PlayerGadgetsContext";
import { useFlatFrameInput } from "../input/impl/flat/bindings";
import { useXRHandAttachment } from "../input/impl/xr/useXRHandAttachment";
import { useQuickMenuHeld } from "../input/system_input";


const DIST = 60;

const OFFSETS = [
    { x: 0, y: -DIST }, // up
    { x: 0, y: DIST }, // down
    { x: -DIST, y: 0 }, // left
    { x: DIST, y: 0 } // right
] as const;

interface BaseSlot {
    icon: React.ReactNode;
    stay_open?: boolean;
}

type SlotAction =
    | { gadget: GadgetName }
    | { expression: PlayerExpression }
    | { on_select: () => void };

type Slot =
    | (BaseSlot & SlotAction)
    | (Omit<BaseSlot, "stay_open"> & { page: Page | null })
    | null;

type Page = { slots: [Slot, Slot, Slot, Slot] };

type QuickMenuHandle = { select: (i: number) => void };

const SELECT_RADIUS = 0.06;
const REARM_RADIUS = 0.03;

const FLAT_SELECT_RADIUS = DIST;
const FLAT_REARM_RADIUS = 15;
const FLAT_CURSOR_SENSITIVITY = 0.5;

// which quadrant a menu-local xy offset points at: up=0 down=1 left=2 right=3
const direction_index = (x: number, y: number) =>
    Math.abs(x) > Math.abs(y) ? (x > 0 ? 3 : 2) : y > 0 ? 0 : 1;

const LUCIDE_PROPS = {
    width: 30 as const
};

const TEXT_PROPS = {
    fontSize: 30 as const
};

const expression_page: Page = {
    slots: [
        {
            icon: <Text {...TEXT_PROPS}>:D</Text>,
            expression: { eyes: "default", mouth: "big_smile" }
        },
        { icon: <ArrowLeft {...LUCIDE_PROPS} />, page: null },
        {
            icon: <Text {...TEXT_PROPS}>:{"{"}</Text>,
            expression: { eyes: "default", mouth: "wobbly_frown" }
        },
        null
    ]
};

const root: Page = {
    slots: [
        { icon: <Smile {...LUCIDE_PROPS} />, page: expression_page },
        { icon: <Camera {...LUCIDE_PROPS} />, gadget: "camera" },
        null,
        null
    ]
};

const QuickMenuItems = ({
    controls,
    active_index,
    on_page_changed
}: {
    controls?: RefObject<QuickMenuHandle | null>;
    active_index?: number | null;
    on_page_changed?: (page: Page) => void;
}) => {
    const [current_page, setCurrentPage] = useState(root);

    const { respawn_gadget } = usePlayerGadgets();
    const { dispatch_expression } = usePlayerExpression();

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
        <Container
            width={200}
            height={200}
            positionType="relative"
            color="white"
            depthWrite={false}
            depthTest={false}
            borderWidth={2}
            borderColor="white"
            borderRadius={100}
        >
            {current_page.slots.map(
                (slot, i) =>
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
                            onPointerDown={
                                controls ? undefined : () => on_slot(slot)
                            }>
                            {slot.icon}
                        </Container>
                    )
            )}
        </Container>
    );
};

const VRQuickMenu = () => {
    const { AnchorSpace, get_hand_world_pos, ray_space_ref } =
        useXRHandAttachment({
            hand: "non_watch_hand"
        });

    const group_ref = useRef<Group>(null);
    const needs_placing = useRef(true);
    const armed = useRef(true);
    const scratch = useMemo(() => new Vector3(), []);
    const q_target = useMemo(() => new Quaternion(), []);
    const q_parent = useMemo(() => new Quaternion(), []);
    const euler = useMemo(() => new Euler(), []);
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

            // snap heading to the controller's yaw (y-axis only)
            if (ray_space_ref.current && group_ref.current.parent) {
                ray_space_ref.current.getWorldQuaternion(q_target);
                euler.setFromQuaternion(q_target, "YXZ");
                q_target.setFromEuler(euler.set(0, euler.y, 0, "YXZ"));

                group_ref.current.parent.getWorldQuaternion(q_parent);
                group_ref.current.quaternion
                    .copy(q_parent.invert())
                    .multiply(q_target);
            }

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
                <Container pixelSize={0.002}>
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
    const { size } = useThree();
    const input = useFlatFrameInput();

    const ui_scale = useMemo(() => size.height / 360, [size.height]);

    const controls = useRef<QuickMenuHandle | null>(null);
    const virtual_cursor = useRef({ x: 0, y: 0 });
    const armed = useRef(true);

    const [active_index, set_active_index] = useState<number | null>(null);

    const cursor_container_ref = useRef<ComponentRef<typeof Container>>(null);

    useFrame(() => {
        const look_dx = input.look.x;
        const look_dy = input.look.y;

        // prevent camera movement
        // TODO: more proper locking system? or is this sustainable
        input.look.x = 0;
        input.look.y = 0;

        let vx = virtual_cursor.current.x + look_dx * FLAT_CURSOR_SENSITIVITY;
        let vy = virtual_cursor.current.y + look_dy * FLAT_CURSOR_SENSITIVITY;

        const dist = Math.hypot(vx, vy);

        if (dist > FLAT_SELECT_RADIUS) {
            vx = (vx / dist) * FLAT_SELECT_RADIUS;
            vy = (vy / dist) * FLAT_SELECT_RADIUS;
        }

        virtual_cursor.current.x = vx;
        virtual_cursor.current.y = vy;

        if (cursor_container_ref.current) {
            cursor_container_ref.current.setProperties({
                transformTranslateX: vx,
                transformTranslateY: vy
            });
        }

        if (dist < FLAT_REARM_RADIUS) {
            armed.current = true;
            if (active_index !== null) set_active_index(null);
            return;
        }

        const i = direction_index(vx, -vy);
        if (active_index !== i) {
            set_active_index(i);
        }

        if (armed.current && dist >= FLAT_SELECT_RADIUS) {
            armed.current = false;
            controls.current?.select(i);
        }
    }, -1); // run before player look handling zeroes it

    return (
        <Fullscreen alignItems="center" justifyContent="center">
            <Container transformScaleX={ui_scale} transformScaleY={ui_scale}>
                <QuickMenuItems
                    controls={controls}
                    active_index={active_index}
                    on_page_changed={() => {
                        // recenter cursor on page change
                        virtual_cursor.current.x = 0;
                        virtual_cursor.current.y = 0;
                        cursor_container_ref.current?.setProperties({
                            transformTranslateX: 0,
                            transformTranslateY: 0
                        });

                        // TODO: wait for new stick input before resuming movement
                        // TODO: automatically zero when stick released (dont use look delta for controller, treat it like a stick surface)

                        armed.current = true;
                        set_active_index(null);
                    }}
                />

                <Container
                    ref={cursor_container_ref}
                    positionType="absolute"
                    inset={0}
                    alignItems="center"
                    justifyContent="center"
                >
                    <Container
                        width={12}
                        height={12}
                        borderRadius={6}
                        backgroundColor="white"
                        opacity={0.7}
                        depthWrite={false}
                        depthTest={false}
                    />
                </Container>
            </Container>
        </Fullscreen>
    );
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
};
