import "../../../../assets/input/promptfont.css"; // TODO: how compatible is this with modern bundlers?

import { useFrame } from "@react-three/fiber";
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction, useMemo, useCallback
} from "react";

export type HintDevice = "kbm" | "xbox" | "playstation" | "switch";

// TODO: cancel throw action
export type HintAction =
    "move" |
    "jump" |
    "sprint" |
    "stop_sprinting" |
    "grab" |
    "release" |
    "throw_tap" |
    "throw_charge" |
    "charged_throw_execute" |
    "use" |
    "watch" |
    "free_cursor" |
    "ui_navigate" |
    "ui_accept" |
    "ui_cancel" |
    "close_watch";

export type HintLayer = "default" | "verbose" | "not_sprinting" | "sprinting" | "not_holding" | "holding" | "holding_throwable" | "holding_useable" | "charging_throw" | "watch_ui";

export type HintGlyphSpec =
    | { kind: "pf"; glyph: string } // promptfont glyph, rendered via its css class
    | { kind: "key"; text: string } // literal text in a box (as it's more readable than a glyph)
    | { kind: "text", text: string }; // literal text, no box for separators etc

const pf = (glyph: string): HintGlyphSpec => ({ kind: "pf", glyph });
const key = (text: string): HintGlyphSpec => ({ kind: "key", text });
const text = (text: string): HintGlyphSpec => ({ kind: "text", text });

export interface InputHint {
    glyphs: HintGlyphSpec[];
    label: string;
}

// TODO: sync with the actual input bindings, and make this configurable by the user
// TODO: I18N everywhere in this app!
const HINTS: Record<HintDevice, Partial<Record<HintAction, InputHint>>> = {
    kbm: {
        move: { glyphs: [key("W"), key("A"), key("S"), key("D")], label: "Move" },
        jump: { glyphs: [key("Space")], label: "Jump" },
        sprint: { glyphs: [pf("button-hold-press"), key("⇧ Shift")], label: "Sprint" },
        stop_sprinting: { glyphs: [pf("button-hold-release"), key("⇧ Shift")], label: "Walk" }, // TODO: diefferentiate between hold and toggle sprinting
        grab: { glyphs: [pf("mouse-2")], label: "Grab" },
        release: { glyphs: [pf("button-hold-release"), pf("mouse-2")], label: "Release" },
        throw_tap: { glyphs: [key("F")], label: "Throw (tap)" },
        throw_charge: { glyphs: [pf("button-hold-press"), key("F")], label: "Throw (charge)" },
        charged_throw_execute: { glyphs: [pf("button-hold-release"), key("F")], label: "Throw (release)" },
        use: { glyphs: [pf("mouse-button-1")], label: "Use" },
        watch: { glyphs: [key("⇥ Tab")], label: "Watch menu" },
        free_cursor: { glyphs: [key("Alt")], label: "Free cursor" },
        ui_navigate: { glyphs: [key("↑"), key("↓"), key("←"), key("→")], label: "Navigate" },
        ui_accept: { glyphs: [key("Enter")], label: "Accept / interact" },
        ui_cancel: { glyphs: [key("Esc")], label: "Cancel / back" },
        close_watch: { glyphs: [], label: "Click outside to close" }
    },

    xbox: {
        move: { glyphs: [pf("analog-l-any")], label: "Move" },
        jump: { glyphs: [pf("xbox-a")], label: "Jump" },
        sprint: { glyphs: [pf("analog-l-touch")], label: "Sprint" },
        stop_sprinting: { glyphs: [pf("analog-l-touch")], label: "Walk" },
        grab: { glyphs: [pf("xbox-left-trigger")], label: "Grab" },
        release: { glyphs: [pf("button-hold-release"), pf("xbox-left-trigger")], label: "Release" },
        throw_tap: { glyphs: [pf("xbox-x")], label: "Throw (tap)" },
        throw_charge: { glyphs: [pf("button-hold-press"), pf("xbox-x")], label: "Throw (charge)" },
        charged_throw_execute: { glyphs: [pf("button-hold-release"), pf("xbox-x")], label: "Throw (release)" },
        use: { glyphs: [pf("xbox-right-trigger")], label: "Use" },
        watch: { glyphs: [pf("xbox-menu")], label: "Watch menu" },
        free_cursor: { glyphs: [pf("xbox-view")], label: "Free cursor" },
        ui_navigate: { glyphs: [pf("analog-l-any"), text("/"), pf("dpad-left"), pf("dpad-right"), pf("dpad-up"), pf("dpad-down")], label: "Navigate" },
        ui_accept: { glyphs: [pf("xbox-a")], label: "Accept / interact" },
        ui_cancel: { glyphs: [pf("xbox-b")], label: "Cancel / back" },
        close_watch: { glyphs: [pf("xbox-menu")], label: "Close watch" }
    },
    playstation: {
        move: { glyphs: [pf("analog-l-any")], label: "Move" },
        jump: { glyphs: [pf("sony-a")], label: "Jump" },
        sprint: { glyphs: [pf("sony-left-stick")], label: "Sprint" },
        stop_sprinting: { glyphs: [pf("sony-left-stick")], label: "Walk" },
        grab: { glyphs: [pf("sony-left-trigger")], label: "Grab" },
        release: { glyphs: [pf("button-hold-release"), pf("sony-left-trigger")], label: "Release" },
        throw_tap: { glyphs: [pf("sony-x")], label: "Throw (tap)" },
        throw_charge: { glyphs: [pf("button-hold-press"), pf("sony-x")], label: "Throw (charge)" },
        charged_throw_execute: { glyphs: [pf("button-hold-release"), pf("sony-x")], label: "Throw (release)" },
        use: { glyphs: [pf("sony-right-trigger")], label: "Use" },
        watch: { glyphs: [pf("sony-options")], label: "Watch menu" },
        free_cursor: { glyphs: [pf("sony-share")], label: "Free cursor" },
        ui_navigate: { glyphs: [pf("analog-l-any"), text("/"), pf("dpad-left"), pf("dpad-right"), pf("dpad-up"), pf("dpad-down")], label: "Navigate" },
        ui_accept: { glyphs: [pf("sony-a")], label: "Accept / interact" },
        ui_cancel: { glyphs: [pf("sony-b")], label: "Cancel / back" },
        close_watch: { glyphs: [pf("sony-options")], label: "Close watch" }
    },
    switch: {
        move: { glyphs: [pf("analog-l-any")], label: "Move" },
        jump: { glyphs: [pf("xbox-b")], label: "Jump" }, // nintendo bottom face button
        sprint: { glyphs: [pf("analog-l-touch")], label: "Sprint" },
        stop_sprinting: { glyphs: [pf("analog-l-touch")], label: "Walk" },
        grab: { glyphs: [pf("nintendo-left-trigger")], label: "Grab" },
        release: { glyphs: [pf("button-hold-release"), pf("nintendo-left-trigger")], label: "Release" },
        throw_tap: { glyphs: [pf("xbox-y")], label: "Throw (tap)" },
        throw_charge: { glyphs: [pf("button-hold-press"), pf("xbox-y")], label: "Throw (charge)" },
        charged_throw_execute: { glyphs: [pf("button-hold-release"), pf("xbox-y")], label: "Throw (release)" },
        use: { glyphs: [pf("nintendo-right-trigger")], label: "Use" },
        watch: { glyphs: [pf("nintendo-plus")], label: "Watch menu" },
        free_cursor: { glyphs: [pf("nintendo-minus")], label: "Free cursor" },
        ui_navigate: { glyphs: [pf("analog-l-any"), text("/"), pf("nintendo-dpad-left"), pf("nintendo-dpad-right"), pf("nintendo-dpad-up"), pf("nintendo-dpad-down")], label: "Navigate" },
        ui_accept: { glyphs: [pf("xbox-b")], label: "Accept / interact" }, // nintendo bottom face button
        ui_cancel: { glyphs: [pf("xbox-a")], label: "Cancel / back" }, // nintendo right face button
        close_watch: { glyphs: [pf("nintendo-plus")], label: "Close watch" }
    }
};

const HINT_LAYERS: Record<HintLayer, HintAction[]> = {
    default: ["watch", "free_cursor"],
    verbose: ["move", "jump"],
    not_sprinting: ["sprint"],
    sprinting: ["stop_sprinting"],
    not_holding: ["grab"],
    holding: ["release"],
    holding_throwable: ["throw_tap", "throw_charge"],
    holding_useable: ["use"],
    charging_throw: ["charged_throw_execute"],
    watch_ui: ["close_watch", "ui_navigate", "ui_accept", "ui_cancel"]
};


type HintSide = "left" | "right" | "both";

const HINT_LAYER_ORDER_LEFT: HintLayer[] = ["default", "verbose", "watch_ui", "not_sprinting", "sprinting"];
const HINT_LAYER_ORDER_RIGHT: HintLayer[] = ["holding_useable", "not_holding", "holding", "holding_throwable", "charging_throw"];
const HINT_LAYER_OVERALL_ORDER: HintLayer[] = [...HINT_LAYER_ORDER_LEFT, ...HINT_LAYER_ORDER_RIGHT];

const HINT_SIDES: Record<HintSide, HintLayer[]> = {
    left: HINT_LAYER_ORDER_LEFT,
    right: HINT_LAYER_ORDER_RIGHT,
    both: HINT_LAYER_OVERALL_ORDER
};

const HINT_LAYER_DEPENDENCIES: Partial<Record<HintLayer, HintLayer[]>> = {
    holding_useable: ["holding"],
    holding_throwable: ["holding"],
    charging_throw: ["holding_throwable"],
};

const HINT_LAYER_SUPPRESSES: Partial<Record<HintLayer, HintLayer[]>> = {
    sprinting: ["not_sprinting"],
    holding: ["not_holding"],
    charging_throw: ["holding_throwable"],
    watch_ui: ["default", "verbose", "not_sprinting", "sprinting", "not_holding", "holding", "holding_throwable", "holding_useable", "charging_throw"]
};

export const compute_hint_actions_from_layers = (layers: HintLayer[], side_filter: HintSide = "both"): HintAction[] => {
    const side_order = HINT_SIDES[side_filter];

    const suppressed = new Set<HintLayer>();
    for (const layer of layers) {
        // check dependencies before its own suppressions, but after other suppressions. if any are missing then suppress this layer
        const dependencies = HINT_LAYER_DEPENDENCIES[layer] ?? [];
        if (!dependencies.every((dep) => layers.includes(dep) && !suppressed.has(dep))) {
            suppressed.add(layer);
            continue;
        }

        if (!side_order.includes(layer)) {
            suppressed.add(layer);
            continue;
        }

        for (const target of HINT_LAYER_SUPPRESSES[layer] ?? []) {
            suppressed.add(target);
        }
    }
    const visible_layers = layers.filter((layer) => !suppressed.has(layer));

    const actions = new Set<HintAction>();
    for (const layer of visible_layers) {
        const layer_actions = HINT_LAYERS[layer];
        for (const action of layer_actions) {
            actions.add(action);
        }
    }
    return Array.from(actions).sort((a, b) => {
        const a_index = side_order.findIndex((layer) => HINT_LAYERS[layer].includes(a));
        const b_index = side_order.findIndex((layer) => HINT_LAYERS[layer].includes(b));
        return a_index - b_index;
    });
};

const glyph_key = (spec: HintGlyphSpec): string => spec.kind === "pf" ? `pf:${spec.glyph}` : `key:${spec.text}`;

export const HintGlyph = ({ action, merge_same_label = true, show_label = true, className = "", glyph_className = "" }: { action: HintAction; merge_same_label?: boolean, show_label?: boolean, className?: string, glyph_className?: string }) => {
    const {device} = useHintState();
    const hint = HINTS[device][action];
    if (!hint) return null;

    return (
        <div aria-label={hint.label} className={className}>
            {hint.glyphs.map((spec) => (
                <div key={glyph_key(spec)} className={glyph_className}>
                    {spec.kind === "pf"
                        ? <span className={`pf pf-${spec.glyph}`} aria-hidden="true" />
                        : spec.kind === "key"
                            ? <kbd className="font-sans text-[0.5em] flex items-center justify-center border-1 border-white h-[2.6em] min-w-[2.6em] p-1 rounded-sm" aria-hidden="true">{spec.text}</kbd>
                            : <span className="font-sans text-[0.5em]" aria-hidden="true">{spec.text}</span>
                    }
                    {show_label && !merge_same_label && <span>{hint.label}</span>}
                </div>
            ))}

            {show_label && merge_same_label && <span>{hint.label}</span>}
        </div>
    );
};

export const AutoHintGlyphs = ({ side = "both", show_labels = true, merge_same_label = true, className = "", action_className = "", glyph_className = "" }: { side?: HintSide, show_labels?: boolean, merge_same_label?: boolean, className?: string, action_className?: string, glyph_className?: string }) => {
    const {layers} = useHintState();
    const actions = useMemo(() => compute_hint_actions_from_layers(layers, side), [layers, side]);

    return (
        <div className={className}>
            {actions.map((action) => (
                <HintGlyph key={action} action={action} merge_same_label={merge_same_label} show_label={show_labels} className={action_className} glyph_className={glyph_className} />
            ))}
        </div>
    );
}

export interface HintStateContextType {
    device: HintDevice;
    layers: HintLayer[];
}

const HintStateContext = createContext<HintStateContextType | null>(null);

interface SetHintStateContextType {
    set_device: Dispatch<SetStateAction<HintDevice>>;
    add_layer: (layer: HintLayer) => void;
    remove_layer: (layer: HintLayer, clear?: boolean) => void;
}

const SetHintStateContext = createContext<SetHintStateContextType | null>(null);

export const HintStateProvider = ({ children }: { children: ReactNode }) => {
    const [device, set_device] = useState<HintDevice>("kbm");
    const [layer_counts, set_layer_counts] = useState<Partial<Record<HintLayer, number>>>({
        default: 1,
        not_sprinting: 1
    });

    const add_layer = useCallback((layer: HintLayer) => {
        set_layer_counts((prev_counts) => ({
            ...prev_counts,
            [layer]: (prev_counts[layer] ?? 0) + 1
        }));
    }, []);

    const remove_layer = useCallback((layer: HintLayer, clear = false) => {
        set_layer_counts((prev_counts) => {
            const current = prev_counts[layer] ?? 0;
            if (current <= 0) {
                console.warn(`remove_layer("${layer}") without a matching add_layer`);
                return prev_counts;
            }
            return { ...prev_counts, [layer]: clear ? 0 : current - 1 };
        });
    }, []);

    const layers = useMemo(
        () =>
            (Object.keys(layer_counts) as HintLayer[]).filter(
                (layer) => (layer_counts[layer] ?? 0) > 0
            ),
        [layer_counts]
    );

    return (
        <HintStateContext.Provider value={{ device, layers }}>
            <SetHintStateContext.Provider value={{ set_device, add_layer, remove_layer }}>
                {children}
            </SetHintStateContext.Provider>
        </HintStateContext.Provider>
    );
};

export const useHintState = () => {
    const state = useContext(HintStateContext);
    if (state === null) throw new Error("useHintState must be used within a HintStateProvider");
    return state;
};

export const useSetHintState = () => {
    const setters = useContext(SetHintStateContext);
    if (setters === null) throw new Error("useSetHintState must be used within a HintStateProvider");
    return setters;
};

const detect_gamepad_device = (gamepad_id: string): HintDevice => {
    const id_lower = gamepad_id.toLowerCase();
    if (id_lower.includes("054c") || id_lower.includes("dualsense") || id_lower.includes("dualshock")) {
        return "playstation";
    }
    if (id_lower.includes("057e") || id_lower.includes("nintendo") || id_lower.includes("joy-con")) {
        return "switch";
    }

    // gamepad "standard" mapping is defined in xbox terms, sane default
    return "xbox";
};

const GAMEPAD_ACTIVITY_THRESHOLD = 0.25; // ignore stick drift

export const HintDevicePublisher = () => {
    const {set_device} = useSetHintState();

    useEffect(() => {
        const on_kbm_activity = () => set_device("kbm");
        window.addEventListener("keydown", on_kbm_activity);
        window.addEventListener("mousedown", on_kbm_activity);
        return () => {
            window.removeEventListener("keydown", on_kbm_activity);
            window.removeEventListener("mousedown", on_kbm_activity);
        };
    }, [set_device]);

    useFrame(() => {
        for (const gamepad of navigator.getGamepads()) {
            if (!gamepad) continue;

            const button_active = gamepad.buttons.some((button) => button.pressed);
            const axis_active = gamepad.axes.some(
                (axis_value) => Math.abs(axis_value) > GAMEPAD_ACTIVITY_THRESHOLD
            );

            if (button_active || axis_active) {
                set_device(detect_gamepad_device(gamepad.id));
                return;
            }
        }
    });

    return null;
};
