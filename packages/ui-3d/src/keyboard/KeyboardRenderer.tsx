import { useSetting } from "@hyperlinkvr/react";
import { useFrame } from "@react-three/fiber";
import { Container, Text } from "@react-three/uikit";
import { Globe } from "@react-three/uikit-lucide";
import {
    ComponentRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { MathUtils } from "three";



import type { Key, KeyAction, KeyboardLayout } from "./layout";
import { available_layouts, choose_layout } from "./layouts";
import { useKeyboardStore } from "./store";
import { backspace, insert_text, submit } from "./write";


const KEYBOARD_WIDTH = 560;
const KEY_HEIGHT = 44;
const GAP = 6;

const key_label = (key: Key) => {
    if (key.label != null) return key.label;
    // only insert keys have a sensible auto-label (the text they type)
    return key.action.kind === "insert" ? key.action.text : "";
};

const KeyButton = ({ item, on_press }: { item: Key; on_press: (action: KeyAction) => void }) => {
    const label = key_label(item);
    return (
        <Container
            flexGrow={item.width ?? 1}
            flexBasis={0}
            height={KEY_HEIGHT}
            borderRadius={6}
            backgroundColor="#3a3a3a"
            justifyContent="center"
            alignItems="center"
            hover={{ backgroundColor: "#505050" }}
            active={{ backgroundColor: "#2a2a2a" }}
            onPointerDown={() => on_press(item.action)}
        >
            {typeof label === "string" ? <Text fontSize={18} color="white">{label}</Text> : label}
        </Container>
    );
};

const LocalePicker = ({ on_select }: { on_select: (id: KeyboardLayout["id"]) => void }) => (
    <Container flexDirection="column" gap={GAP} maxHeight={KEY_HEIGHT * 5} overflow="scroll">
        {available_layouts.map((layout) => (
            <Container
                key={`${layout.id.locale}:${layout.id.variant ?? ""}`}
                height={KEY_HEIGHT}
                borderRadius={6}
                backgroundColor="#3a3a3a"
                justifyContent="center"
                alignItems="center"
                hover={{ backgroundColor: "#505050" }}
                onPointerDown={() => on_select(layout.id)}
            >
                <Text fontSize={16} color="white">{layout.label}</Text>
            </Container>
        ))}
    </Container>
);

const Keyboard = ({visible = true, on_hidden}: {visible?: boolean; on_hidden?: () => void}) => {
    // TODO: way for certain inputs to force a specific layout, good for numpads etc
    // TODO: way to render fixed always in world keyboard (for dom mirror) that doesnt attach to store and can emit directly to a target

    const [requested_layout, set_requested_layout] = useSetting("keyboard_layout");
    const keyboard_layout = useMemo(() => choose_layout(requested_layout), [requested_layout]);

    const target = useKeyboardStore((s) => s.target);

    const [page, setPage] = useState(keyboard_layout.default_page);
    const [picker_open, setPickerOpen] = useState(false);
    // shift-once: return to the default page after the next character is inserted
    const pending_unshift = useRef(false);

    const press = useCallback(
        (action: KeyAction) => {
            switch (action.kind) {
                case "insert":
                    if (target) insert_text(target, action.text);
                    if (pending_unshift.current) {
                        pending_unshift.current = false;
                        setPage(keyboard_layout.default_page);
                    }
                    break;
                case "backspace":
                    if (target) backspace(target);
                    break;
                case "enter":
                    if (target) submit(target);
                    break;
                case "goto":
                    pending_unshift.current = false;
                    setPage(action.page);
                    break;
                case "shift-once":
                    pending_unshift.current = true;
                    setPage("shift");
                    break;
            }
        },
        [target, keyboard_layout]
    );

    const select_layout = useCallback(
        (id: KeyboardLayout["id"]) => {
            set_requested_layout(id);
            setPage("letters");
            setPickerOpen(false);
        },
        [set_requested_layout]
    );

    const container_ref = useRef<ComponentRef<typeof Container> | null>(null);
    const opacity_ref = useRef(0);
    const set_container = useCallback((container: ComponentRef<typeof Container> | null) => {
        container_ref.current = container;
        if (container) container.setProperties({ opacity: 0 }); // start transparent before the frame loop takes over
    }, []);

    // fade in and out when visibility changes (but don't unmount, that's for the parent)
    useFrame((_, delta) => {
        const container = container_ref.current;
        if (!container) return;

        const target_opacity = visible ? 1 : 0;
        opacity_ref.current = MathUtils.lerp(
            opacity_ref.current,
            target_opacity,
            delta * 10
        );

        container.setProperties({ opacity: opacity_ref.current });

        if (!visible && opacity_ref.current < 0.01) {
            on_hidden?.();
        }
    });

    // guard against a page a shift-once/goto pointed at that this layout doesn't define
    const rows = keyboard_layout.pages[page] ?? keyboard_layout.pages[keyboard_layout.default_page]!;

    return (
        <Container
            ref={set_container}
            width={KEYBOARD_WIDTH}
            flexDirection="column"
            gap={GAP}
            padding={GAP}
            borderRadius={10}
            backgroundColor="#1e1e1e"
        >
            <Container flexDirection="row" justifyContent="space-between" alignItems="center" paddingX={4}>
                <Text fontSize={12} color="#888888">{keyboard_layout.label}</Text>
                <Container
                    width={KEY_HEIGHT}
                    height={KEY_HEIGHT * 0.66}
                    borderRadius={6}
                    justifyContent="center"
                    alignItems="center"
                    backgroundColor={picker_open ? "#505050" : "#3a3a3a"}
                    hover={{ backgroundColor: "#505050" }}
                    onPointerDown={() => setPickerOpen((open) => !open)}
                >
                    <Globe width={18} color="white" />
                </Container>
            </Container>

            {picker_open ? (
                <LocalePicker on_select={select_layout} />
            ) : (
                rows.map((row, r) => (
                    <Container key={r} flexDirection="row" gap={GAP} justifyContent="center">
                        {row.map((item, k) => (
                            <KeyButton key={k} item={item} on_press={press} />
                        ))}
                    </Container>
                ))
            )}
        </Container>
    );
};

export const KeyboardRenderer = () => {
    const is_open = useKeyboardStore((s) => s.is_open);
    const [mounted, setMounted] = useState(is_open);

    useEffect(() => {
        if (is_open) {
            setMounted(true);
        }
    }, [is_open]);

    if (!mounted) {
        return null;
    }

    return <Keyboard visible={is_open} on_hidden={() => setMounted(false)} />;
};
