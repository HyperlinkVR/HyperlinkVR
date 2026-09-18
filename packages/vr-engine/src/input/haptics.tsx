import { useSessionMode } from "@hyperlinkvr/react";
import { useXRInputSourceStates } from "@react-three/xr";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";



import { useHintState } from "./impl/flat/hints";


interface PerMotorHapticIntensity {
    // best effort, if the device doesnt have multiple motors it uses the fallback policy
    fine?: number;
    heavy?: number;
    fallback: "fine" | "heavy" | "merge";
}

interface SingleHapticIntensity {
    value: number;
}

export type HapticIntensity = PerMotorHapticIntensity | SingleHapticIntensity;

export interface HapticRumbleEvent {
    type: "rumble"
    intensity: HapticIntensity;
    duration_ms: number;
    start_delay_ms?: number;
}

interface HapticSleepEvent {
    type: "sleep"
    duration_ms: number;
}

export type HapticEvent = HapticRumbleEvent | HapticSleepEvent;
export type HapticPattern = ReadonlyArray<HapticEvent>;

// chrome uses vibrationActuator, firefox uses hapticActuators
const access_actuators = (gamepad: Gamepad): ReadonlyArray<GamepadHapticActuator> => {
    if (gamepad.vibrationActuator) {
        return [gamepad.vibrationActuator];
    } else if (gamepad.hapticActuators) {
        return gamepad.hapticActuators;
    } else {
        return [];
    }
};

interface HapticsContextType {

}

const HapticsContext = createContext<HapticsContextType | null>(null);

const BaseHapticsProvider = ({collect_actuators, children}: {children: React.ReactNode, collect_actuators: () => ReadonlyArray<GamepadHapticActuator>}) => {
    const actuators = useRef<ReadonlyArray<GamepadHapticActuator>>([]);

    useEffect(() => {
        actuators.current = collect_actuators();
        console.log("Collected haptic actuators:", actuators.current);
    }, [collect_actuators]);

    // logic upon actuatrors to be shared lives here

    return (
        <HapticsContext.Provider value={{}}>
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
                .flatMap(access_actuators);
        }
    }, [flat_device]);

    return (
        <BaseHapticsProvider collect_actuators={collect_actuators}>
            {children}
        </BaseHapticsProvider>
    );
}

const XRHapticsProvider = ({children}: {children: React.ReactNode}) => {
    const xr_inputs = useXRInputSourceStates();

    const collect_actuators = useCallback(() => {
        // collect xr controllers that have haptic actuators
        return xr_inputs
            .filter((input) => input.type === "controller")
            .flatMap((input) => {
                const gamepad = input.inputSource.gamepad;
                if (gamepad) {
                    return access_actuators(gamepad);
                } else {
                    return [];
                }
            });
    }, [xr_inputs]);

    return (
        <BaseHapticsProvider collect_actuators={collect_actuators}>
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
