import {useFrame} from "@react-three/fiber";
import {useXRInputSourceState} from "@react-three/xr";
import {useCallback, useEffect, useRef} from "react";
import type {ReportEvent} from "@hyperlinkvr/vr-engine-schemas";
import {useSetting} from "@hyperlinkvr/react";

import {useWebSDKMessaging} from "../contexts/WebSDKMessagingContext";
import {useSessionMode} from "../contexts/SessionModeContext";
import {useHands} from "../input/hands";
import {useFlatFrameInput} from "../input/impl/flat/bindings";
import {StandardControllerInput} from "../input/impl/flat/bindings";
import type {
    CompiledAxisMonitor,
    CompiledButtonMonitor} from "./input_monitor_registry";
import {
    get_input_monitor_entries
} from "./input_monitor_registry";

// flat look arrives as a per-frame pixel delta while xr look is a stick
// position, so the consolidated "look" axis is converted to an approximate
// turn rate in rad/s to give worlds one comparable number across schemes
const FLAT_LOOK_PIXELS_PER_RADIAN = 900;
const XR_LOOK_RADIANS_PER_SECOND = 2.6;

// one message per frame no matter how many monitors fired
const pending_reports: ReportEvent[] = [];

// sources that cannot resolve on the current scheme are silent by design, but a
// world author needs to hear about it once rather than guessing
const warned_sources = new Set<string>();

const warn_once = (source_id: string, message: string) => {
    if (warned_sources.has(source_id)) {
        return;
    }
    warned_sources.add(source_id);
    console.warn(`Input monitor ${source_id}: ${message}`);
};

interface SampleContext {
    session_mode: "vr" | "flat";
    hands: ReturnType<typeof useHands>;
    flat_input: ReturnType<typeof useFlatFrameInput>;
    left_controller: any;
    right_controller: any;
    held_keys: Set<string>;
    locomotion_hand: "left" | "right";
    look_accumulator: {x: number; y: number; since_ms: number};
}

interface ButtonSample {
    pressed: boolean;
    handedness: "left" | "right" | null;
}

const xr_button_pressed = (controller: any, code: string): boolean =>
    controller?.gamepad?.[code]?.state === "pressed";

const xr_analog_value = (controller: any, code: string): number =>
    controller?.gamepad?.[code]?.button ?? 0;

// consolidated actions resolve differently per scheme: this is the only place
// that knows which physical input an intent lands on
const sample_action_button = (
    action: string,
    context: SampleContext,
    source_id: string
): ButtonSample | null => {
    if (context.session_mode === "flat") {
        const flat = context.flat_input;

        switch (action) {
            case "use":
                return {pressed: flat.use, handedness: null};
            case "grab":
                return {pressed: flat.grab, handedness: null};
            case "jump":
                return {pressed: flat.jump, handedness: null};
            case "sprint":
                return {pressed: flat.sprint, handedness: null};
            case "throw":
                return {pressed: flat.throw_held, handedness: null};
            case "menu":
                // tab / start, the same input that presents the watch
                return {pressed: flat.ui.next, handedness: null};
            case "primary":
                return {pressed: flat.ui.accept, handedness: null};
            case "secondary":
                return {pressed: flat.ui.cancel, handedness: null};
        }

        warn_once(source_id, `action "${action}" has no flat binding`);
        return null;
    }

    // vr: grab and use come from the hand button states the grabbable system
    // already maintains, so a monitor and a grabbable always agree
    switch (action) {
        case "use": {
            const pressed_hand = context.hands.find((hand) => hand.trigger.pressed);
            return {
                pressed: pressed_hand !== undefined,
                handedness: pressed_hand?.handedness ?? null
            };
        }
        case "grab": {
            const pressed_hand = context.hands.find((hand) => hand.grab.pressed);
            return {
                pressed: pressed_hand !== undefined,
                handedness: pressed_hand?.handedness ?? null
            };
        }
        case "jump":
            return {
                pressed: xr_button_pressed(context.right_controller, "a-button"),
                handedness: "right"
            };
        case "primary":
            return {
                pressed: xr_button_pressed(context.right_controller, "a-button"),
                handedness: "right"
            };
        case "secondary":
            return {
                pressed: xr_button_pressed(context.right_controller, "b-button"),
                handedness: "right"
            };
        case "sprint":
            return {
                pressed: xr_button_pressed(context.left_controller, "xr-standard-thumbstick"),
                handedness: "left"
            };
    }

    warn_once(source_id, `action "${action}" has no vr binding`);
    return null;
};

const sample_button = (
    entry: CompiledButtonMonitor,
    context: SampleContext
): ButtonSample | null => {
    const source = entry.source;

    if (source.kind === "action") {
        return sample_action_button(source.action, context, entry.source_id);
    }

    if (source.scheme === "xr") {
        if (context.session_mode !== "vr") {
            return null;
        }

        if (source.hand === "either") {
            const left_pressed = xr_button_pressed(context.left_controller, source.code);
            const right_pressed = xr_button_pressed(context.right_controller, source.code);
            return {
                pressed: left_pressed || right_pressed,
                handedness: left_pressed ? "left" : right_pressed ? "right" : null
            };
        }

        const controller =
            source.hand === "left" ? context.left_controller : context.right_controller;
        return {
            pressed: xr_button_pressed(controller, source.code),
            handedness: source.hand
        };
    }

    if (source.scheme === "gamepad") {
        const pad = navigator.getGamepads?.()[0];
        if (!pad) {
            return null;
        }

        const index = (StandardControllerInput as unknown as Record<string, number>)[source.code];
        if (index === undefined) {
            warn_once(entry.source_id, `unknown gamepad code "${source.code}"`);
            return null;
        }

        return {pressed: pad.buttons[index]?.pressed ?? false, handedness: null};
    }

    return {pressed: context.held_keys.has(source.code), handedness: null};
};

// writes into out_values, returning false when the source does not apply to the
// current scheme
const sample_axis = (
    entry: CompiledAxisMonitor,
    context: SampleContext,
    out_values: {x: number; y: number}
): boolean => {
    const source = entry.source;

    if (source.kind === "action") {
        if (source.action === "move") {
            if (context.session_mode === "flat") {
                out_values.x = context.flat_input.move.x;
                out_values.y = context.flat_input.move.y;
                return true;
            }

            const controller =
                context.locomotion_hand === "left"
                    ? context.left_controller
                    : context.right_controller;
            const thumbstick = controller?.gamepad?.["xr-standard-thumbstick"];
            out_values.x = thumbstick?.xAxis ?? 0;
            out_values.y = -(thumbstick?.yAxis ?? 0); // stick y is inverted against "forward"
            return true;
        }

        // look is a per-frame delta that the camera consumes and clears, so it
        // is accumulated between reports and converted to rad/s on emit, giving
        // the same units as the vr stick rather than a value that reads as zero
        // whenever the sampler happens to run after the camera
        if (context.session_mode === "flat") {
            const accumulator = context.look_accumulator;
            const elapsed_seconds = Math.max((performance.now() - accumulator.since_ms) / 1000, 1e-4);
            out_values.x = accumulator.x / FLAT_LOOK_PIXELS_PER_RADIAN / elapsed_seconds;
            out_values.y = accumulator.y / FLAT_LOOK_PIXELS_PER_RADIAN / elapsed_seconds;
            return true;
        }

        const turn_hand = context.locomotion_hand === "left" ? "right" : "left";
        const controller =
            turn_hand === "left" ? context.left_controller : context.right_controller;
        const thumbstick = controller?.gamepad?.["xr-standard-thumbstick"];
        out_values.x = (thumbstick?.xAxis ?? 0) * XR_LOOK_RADIANS_PER_SECOND;
        out_values.y = 0;
        return true;
    }

    if (source.scheme === "xr") {
        if (context.session_mode !== "vr") {
            return false;
        }

        const controller =
            source.hand === "left" ? context.left_controller : context.right_controller;

        if (source.control === "thumbstick" || source.control === "touchpad") {
            const code =
                source.control === "thumbstick"
                    ? "xr-standard-thumbstick"
                    : "xr-standard-touchpad";
            const axes = controller?.gamepad?.[code];
            out_values.x = axes?.xAxis ?? 0;
            out_values.y = -(axes?.yAxis ?? 0);
            return true;
        }

        const code =
            source.control === "trigger" ? "xr-standard-trigger" : "xr-standard-squeeze";
        out_values.x = xr_analog_value(controller, code);
        out_values.y = 0;
        return true;
    }

    if (source.scheme === "gamepad") {
        const pad = navigator.getGamepads?.()[0];
        if (!pad) {
            return false;
        }

        switch (source.control) {
            case "left-stick":
                out_values.x = pad.axes[0] ?? 0;
                out_values.y = -(pad.axes[1] ?? 0);
                return true;
            case "right-stick":
                out_values.x = pad.axes[2] ?? 0;
                out_values.y = -(pad.axes[3] ?? 0);
                return true;
            case "left-trigger":
                out_values.x =
                    pad.buttons[StandardControllerInput.L_TRIGGER]?.value ?? 0;
                out_values.y = 0;
                return true;
            case "right-trigger":
                out_values.x =
                    pad.buttons[StandardControllerInput.R_TRIGGER]?.value ?? 0;
                out_values.y = 0;
                return true;
        }
    }

    if (source.control === "wasd") {
        out_values.x = context.flat_input.move.x;
        out_values.y = context.flat_input.move.y;
        return true;
    }

    out_values.x = context.flat_input.look.x;
    out_values.y = context.flat_input.look.y;
    return true;
};

const axis_scratch = {x: 0, y: 0};

interface ControllerStates {
    left: any;
    right: any;
}

// the xr hooks throw outside an <XR> tree, which is every flat session, so they
// are quarantined in a child that only mounts in vr. it writes into a ref the
// ticker reads, keeping one copy of the sampling logic for both schemes
const XRControllerBridge = ({target}: {target: React.RefObject<ControllerStates>}) => {
    const left_controller = useXRInputSourceState("controller", "left");
    const right_controller = useXRInputSourceState("controller", "right");

    target.current.left = left_controller;
    target.current.right = right_controller;

    return null;
};

const InputMonitorTicker = ({controllers}: {controllers: React.RefObject<ControllerStates>}) => {
    const {emit_event, connected} = useWebSDKMessaging();
    const session_mode = useSessionMode();
    const hands = useHands();
    const flat_input = useFlatFrameInput();
    const [locomotion_hand] = useSetting("vr_locomotion_hand");

    const connected_ref = useRef(connected);
    connected_ref.current = connected;

    const emit_ref = useRef(emit_event);
    emit_ref.current = emit_event;

    const context_ref = useRef<SampleContext>({
        session_mode,
        hands,
        flat_input,
        left_controller: null,
        right_controller: null,
        held_keys: new Set<string>(),
        locomotion_hand,
        look_accumulator: {x: 0, y: 0, since_ms: performance.now()},
    });

    context_ref.current.session_mode = session_mode;
    context_ref.current.hands = hands;
    context_ref.current.flat_input = flat_input;
    context_ref.current.locomotion_hand = locomotion_hand;

    // raw kbm sources need their own listeners: the flat bindings keep their key
    // set private and only expose the consolidated actions
    useEffect(() => {
        const held_keys = context_ref.current.held_keys;

        const handle_key_down = (event: KeyboardEvent) => held_keys.add(event.code);
        const handle_key_up = (event: KeyboardEvent) => held_keys.delete(event.code);
        const handle_mouse_down = (event: MouseEvent) => held_keys.add(`Mouse${event.button}`);
        const handle_mouse_up = (event: MouseEvent) => held_keys.delete(`Mouse${event.button}`);
        // a key held while the tab loses focus never sends its keyup
        const handle_blur = () => held_keys.clear();

        window.addEventListener("keydown", handle_key_down);
        window.addEventListener("keyup", handle_key_up);
        window.addEventListener("mousedown", handle_mouse_down);
        window.addEventListener("mouseup", handle_mouse_up);
        window.addEventListener("blur", handle_blur);

        return () => {
            window.removeEventListener("keydown", handle_key_down);
            window.removeEventListener("keyup", handle_key_up);
            window.removeEventListener("mousedown", handle_mouse_down);
            window.removeEventListener("mouseup", handle_mouse_up);
            window.removeEventListener("blur", handle_blur);
            held_keys.clear();
        };
    }, []);

    const tick = useCallback(() => {
        const entries = get_input_monitor_entries();
        if (entries.length === 0 || !connected_ref.current) {
            return;
        }

        const context = context_ref.current;

        // null in flat, where the bridge never mounted
        context.left_controller = controllers.current.left;
        context.right_controller = controllers.current.right;

        const now = performance.now();

        for (const entry of entries) {
            if (entry.entry_type === "button") {
                const sample = sample_button(entry, context);
                if (!sample) {
                    continue;
                }

                const just_pressed = sample.pressed && !entry.was_pressed;
                const just_released = !sample.pressed && entry.was_pressed;

                if (just_pressed) {
                    entry.pressed_since_ms = now;
                    entry.hold_fired = false;
                }

                entry.was_pressed = sample.pressed;

                const emit_button = (type: "press" | "release" | "hold") => {
                    pending_reports.push({
                        source_id: entry.source_id,
                        object_id: entry.subject_id,
                        kind: "button-input",
                        ts: now,
                        payload: {type, handedness: sample.handedness ?? undefined}
                    } as unknown as ReportEvent);
                };

                if (just_pressed && entry.report_press) {
                    emit_button("press");
                }

                if (just_released && entry.report_release) {
                    emit_button("release");
                }

                if (
                    sample.pressed &&
                    !entry.hold_fired &&
                    entry.hold_seconds !== null &&
                    now - entry.pressed_since_ms >= entry.hold_seconds * 1000
                ) {
                    entry.hold_fired = true;
                    emit_button("hold");
                }

                continue;
            }

            if (!sample_axis(entry, context, axis_scratch)) {
                continue;
            }

            const {x: sample_x, y: sample_y} = axis_scratch;
            const settled = sample_x === 0 && sample_y === 0;

            // one final report as the axis reaches rest, otherwise the last thing
            // the world heard is a small non-zero value and it never learns the
            // player stopped
            const settling = settled && !entry.was_settled && entry.report_settle;

            if (settled && entry.was_settled) {
                if (entry.source.kind === "action" && entry.source.action === "look") {
                    context.look_accumulator.since_ms = now;
                }
                continue;
            }

            const unchanged =
                entry.has_emitted &&
                Math.abs(sample_x - entry.last_x) <= entry.min_change_delta &&
                Math.abs(sample_y - entry.last_y) <= entry.min_change_delta;

            const rate_limited = now - entry.last_emit_ms < entry.min_interval_ms;

            entry.was_settled = settled;

            if (!settling && (unchanged || rate_limited)) {
                continue;
            }

            entry.last_emit_ms = now;
            entry.has_emitted = true;
            entry.last_x = sample_x;
            entry.last_y = sample_y;

            if (entry.source.kind === "action" && entry.source.action === "look") {
                context.look_accumulator.x = 0;
                context.look_accumulator.y = 0;
                context.look_accumulator.since_ms = now;
            }

            pending_reports.push({
                source_id: entry.source_id,
                object_id: entry.subject_id,
                kind: "axis-input",
                ts: now,
                payload: {
                    axes: ["x", "y"],
                    values: {x: sample_x, y: sample_y, z: 0}
                }
            } as unknown as ReportEvent);
        }

        if (pending_reports.length === 0) {
            return;
        }

        try {
            emit_ref.current({
                type: "HVRSDK_ENGINE_OBJECT_REPORT_BATCH",
                reports: pending_reports.slice()
            });
        } catch (error) {
            console.warn("Failed to emit input monitor reports", error);
        }

        pending_reports.length = 0;
    }, [controllers]);

    // look is written by the bindings at -10 and zeroed by the camera at 0, so
    // the only reliable window to read it is between the two. -5 orders after
    // the write and before the consume, and negative priorities don't take over
    // the render loop the way positive ones do
    useFrame(() => {
        const accumulator = context_ref.current.look_accumulator;
        accumulator.x += context_ref.current.flat_input.look.x;
        accumulator.y += context_ref.current.flat_input.look.y;
    }, -5);

    useFrame(tick);

    return null;
};

export const InputMonitorRunner = () => {
    const session_mode = useSessionMode();
    const controllers = useRef<ControllerStates>({left: null, right: null});

    return (
        <>
            {session_mode === "vr" && <XRControllerBridge target={controllers} />}
            <InputMonitorTicker controllers={controllers} />
        </>
    );
};
