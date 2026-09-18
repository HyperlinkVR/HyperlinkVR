import { useSessionMode } from "@hyperlinkvr/react";
import { useXRInputSourceStates } from "@react-three/xr";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";



import { useHintState } from "./impl/flat/hints";


interface PerMotorHapticIntensity {
    // best effort, if the device doesnt have multiple motors it uses the fallback policy
    weak?: number;
    strong?: number;
    fallback: "weak" | "strong" | "merge";
}

interface SingleHapticIntensity {
    value: number;
}

export type HapticIntensity = PerMotorHapticIntensity | SingleHapticIntensity;

export interface HapticRumbleEvent {
    type: "rumble"
    intensity: HapticIntensity;
    duration_ms: number;
    vr_hand?: "left" | "right";
    start_delay_ms?: number;
}

interface HapticSleepEvent {
    type: "sleep"
    duration_ms: number;
}

export type HapticEvent = HapticRumbleEvent | HapticSleepEvent;
export type HapticPattern = ReadonlyArray<HapticEvent>;

interface ActuatorTags {
    hand?: "left" | "right";
}

interface TaggedHapticActuator {
    actuator: GamepadHapticActuator;
    tags: ActuatorTags;
}

// chrome uses vibrationActuator, firefox uses hapticActuators
const access_actuators = (gamepad: Gamepad, tags: ActuatorTags = {}): ReadonlyArray<TaggedHapticActuator> => {
    if (gamepad.vibrationActuator) {
        console.log("Found vibrationActuator on gamepad:", gamepad.id, gamepad.vibrationActuator);
        return [{ actuator: gamepad.vibrationActuator, tags }];
    } else if (gamepad.hapticActuators) {
        return gamepad.hapticActuators.map((actuator) => ({ actuator, tags }));
    } else {
        return [];
    }
};

interface HapticsContextType {
    rumble: (event: Omit<HapticRumbleEvent, "type">) => Promise<(boolean | GamepadHapticsResult)[]>;
    stop_rumble: () => Promise<(boolean | GamepadHapticsResult)[]>;
    rumble_pattern: (pattern: HapticPattern) => Promise<void>;
}

const HapticsContext = createContext<HapticsContextType | null>(null);

interface HapticImpl {
    collect_actuators: () => ReadonlyArray<TaggedHapticActuator>;
    filter_actuators?: (actuators: ReadonlyArray<TaggedHapticActuator>, event: Omit<HapticRumbleEvent, "type">) => ReadonlyArray<TaggedHapticActuator>;
}

const BaseHapticsProvider = ({impl, children}: {children: React.ReactNode, impl: HapticImpl}) => {
    const actuators = useRef<ReadonlyArray<TaggedHapticActuator>>([]);

    useEffect(() => {
        actuators.current = impl.collect_actuators();
        console.log("Collected haptic actuators:", actuators.current);
    }, [impl.collect_actuators]);

    const rumble = useCallback(
        (event: Omit<HapticRumbleEvent, "type">) => {
            const consolidated_intensity = (() => {
                if ("value" in event.intensity) {
                    return event.intensity.value;
                } else {
                    switch (event.intensity.fallback) {
                        case "weak":
                            return event.intensity.weak ?? 0;
                        case "strong":
                            return event.intensity.strong ?? 0;
                        case "merge":
                            return ((event.intensity.weak ?? 0) + (event.intensity.strong ?? 0)) / 2;
                    }
                }
            })();

            const weak_magnitude = (() => {
                if ("value" in event.intensity) {
                    return consolidated_intensity;
                } else if ("weak" in event.intensity) {
                    return event.intensity.weak ?? consolidated_intensity;
                } else {
                    return consolidated_intensity;
                }
            })();

            const strong_magnitude = (() => {
                if ("value" in event.intensity) {
                    return consolidated_intensity;
                } else if ("strong" in event.intensity) {
                    return event.intensity.strong ?? consolidated_intensity;
                } else {
                    return consolidated_intensity;
                }
            })();

            const filtered_actuators = impl.filter_actuators ? impl.filter_actuators(actuators.current, event) : actuators.current;

            // browsers cant agree on a spec :(
            return Promise.all(
                filtered_actuators.map(async ({actuator}) => {
                    if ("playEffect" in actuator && actuator.playEffect) {
                        return actuator.playEffect("dual-rumble", {
                            startDelay: event.start_delay_ms ?? 0,
                            duration: event.duration_ms,
                            weakMagnitude: weak_magnitude,
                            strongMagnitude: strong_magnitude,
                        });
                    } else if ("pulse" in actuator && actuator.pulse) {
                        await new Promise((resolve) => setTimeout(resolve, event.start_delay_ms ?? 0));
                        return actuator.pulse(consolidated_intensity, event.duration_ms);
                    } else {
                        console.warn("Browser does not support playEffect or pulse on haptic actuator:", actuator);
                        return false;
                    }
                })
            );
        },
        [actuators]
    );

    const stop_rumble = useCallback(
        () => {
            return Promise.all(
                actuators.current.map(async ({actuator}) => {
                    if ("reset" in actuator && actuator.reset) {
                        return actuator.reset();
                    } else if ("pulse" in actuator && actuator.pulse) {
                        return actuator.pulse(0, 1);
                    } else {
                        console.warn("Browser does not support reset or pulse on haptic actuator:", actuator);
                        return false;
                    }
                })
            );
        },
        [actuators]
    );

    const rumble_pattern = useCallback(
        async (pattern: HapticPattern) => {
            for (const event of pattern) {
                if (event.type === "rumble") {
                    await rumble(event);
                } else if (event.type === "sleep") {
                    await new Promise((resolve) => setTimeout(resolve, event.duration_ms));
                }
            }
        },
        [rumble]
    );

    return (
        <HapticsContext.Provider value={{ rumble, stop_rumble, rumble_pattern }}>
            {children}
        </HapticsContext.Provider>
    );
}

const FlatHapticsProvider = ({children}: {children: React.ReactNode}) => {
    const {device: flat_device} = useHintState();

    const collect_actuators = useCallback(() => {
        if (flat_device === "kbm") {
            // TODO: if mobile is going to be supported, add a device type for touch screen then collect navigator as an actuator if it exposes rumble
            return [];
        } else {
            // get all connected gamepads that have haptic actuators
            return navigator
                .getGamepads()
                .filter((gp): gp is Gamepad => gp !== null && gp.connected)
                .flatMap((gp) => access_actuators(gp))
        }
    }, [flat_device]);

    return (
        <BaseHapticsProvider impl={{collect_actuators}}>
            {children}
        </BaseHapticsProvider>
    );
}

const XRHapticsProvider = ({children}: {children: React.ReactNode}) => {
    const xr_inputs = useXRInputSourceStates();

    const collect_actuators = useCallback(
        () => {
            // collect xr controllers that have haptic actuators
            return xr_inputs
                .filter((input) => input.type === "controller")
                .flatMap((input) => {
                    const gamepad = input.inputSource.gamepad;
                    if (gamepad) {
                        let hand: "left" | "right" | "none" | undefined = input.inputSource.handedness;
                        if (hand === "none") {
                            hand = undefined;
                        }

                        return access_actuators(gamepad, {hand});
                    } else {
                        return [];
                    }
                });
        },
        [xr_inputs]
    );

    const filter_actuators = useCallback(
        (actuators: ReadonlyArray<TaggedHapticActuator>, event: Omit<HapticRumbleEvent, "type">) => {
            if (event.vr_hand) {
                return actuators.filter((actuator) => actuator.tags.hand === undefined || actuator.tags.hand === event.vr_hand);
            } else {
                return actuators;
            }
        },
        []
    );

    return (
        <BaseHapticsProvider impl={{collect_actuators, filter_actuators}}>
            {children}
        </BaseHapticsProvider>
    );
}

export const HapticsProvider = ({children}: {children: React.ReactNode}) => {
    const session_mode = useSessionMode();

    return (
        <>
            {session_mode === "flat" && <FlatHapticsProvider>{children}</FlatHapticsProvider>}
            {session_mode === "vr" && <XRHapticsProvider>{children}</XRHapticsProvider>}
        </>
    );
}

export const useHaptics = () => {
    const context = useContext(HapticsContext);
    if (!context) {
        throw new Error("useHaptics must be used within a HapticsProvider");
    }
    return context;
}
