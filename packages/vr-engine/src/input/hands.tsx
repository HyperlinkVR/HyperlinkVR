import { useFrame } from "@react-three/fiber";
import { PointerCursorModel, PointerRayModel, useRayPointer } from "@react-three/xr";
import type { Dispatch, SetStateAction} from "react";
import {createContext, useContext, useState, type ReactNode, type RefObject} from "react";
import type { Object3D } from "three";

export interface ButtonState {
    pressed: boolean;
    just_pressed: boolean;
    just_released: boolean;
}

export interface ThrowIntent {
    button: ButtonState;
    charge_seconds: RefObject<number>;
    held_throwable: RefObject<boolean | null>; // lets grabbables tell the flat system whether they can be thrown
}

export const make_button_state = (): ButtonState => ({
    pressed: false,
    just_pressed: false,
    just_released: false
});

export const update_button_state = (b: ButtonState, pressed: boolean) => {
    b.just_pressed = pressed && !b.pressed;
    b.just_released = !pressed && b.pressed;
    b.pressed = pressed;
};

export type HandPose =
    | { kind: "curl"; amount: number }
    | { kind: "gesture"; name: string };

export interface Hand {
    readonly handedness: "left" | "right";
    readonly grip: RefObject<Object3D | null>;
    readonly ray: RefObject<Object3D | null>;
    readonly grab: ButtonState;
    readonly trigger: ButtonState;
    readonly pose: RefObject<HandPose>;
    readonly throw_intent?: ThrowIntent;
}

const HandsContext = createContext<Hand[] | null>(null);
const SetHandsContext = createContext<Dispatch<SetStateAction<Hand[]>> | null>(null);

export const HandsProvider = ({ children }: { children: ReactNode }) => {
    const [hands, set_hands] = useState<Hand[]>([]);
    return (
        <HandsContext.Provider value={hands}>
            <SetHandsContext.Provider value={set_hands}>
                {children}
            </SetHandsContext.Provider>
        </HandsContext.Provider>
    );
};

export const useHands = (): Hand[] => {
    const hands = useContext(HandsContext);
    if (hands === null) throw new Error("useHands must be used within a HandsProvider");
    return hands;
};

export const useSetHands = () => {
    const set_hands = useContext(SetHandsContext);
    if (set_hands === null) throw new Error("useSetHands must be used within a HandsProvider");
    return set_hands;
};

export const HandPointer = ({ hand, state }: { hand: Hand; state: any }) => {
    const pointer = useRayPointer(hand.ray, state);
    useFrame(() => {
        if (hand.trigger.just_pressed) {
            pointer.down({ timeStamp: performance.now(), button: 0 });
        } else if (hand.trigger.just_released) {
            pointer.up({ timeStamp: performance.now(), button: 0 });
        }
    });
    return (
        <>
            <PointerRayModel pointer={pointer} />
            <PointerCursorModel pointer={pointer} />
        </>
    );
};
