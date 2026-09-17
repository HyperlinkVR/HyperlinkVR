import { useFrame } from "@react-three/fiber";
import { PointerCursorModel, PointerRayModel, useRayPointer, useXRInputSourceState, XRSpace } from "@react-three/xr";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Group, Object3D} from "three";



import { make_button_state, update_button_state, useSetHands, type Hand, type HandPose } from "../../hands";


// how far the hand can point at / click a target, in metres. also filters out the
// void-object "miss" intersection, which the pointer parks at distance 10000000
const MAX_POINT_DISTANCE = 5;

const useXRHandSlot = (handedness: "left" | "right") => {
    const state = useXRInputSourceState("controller", handedness);
    const grip = useRef<Group>(null);
    const ray = useRef<Group>(null);
    const pose = useRef<HandPose>({ kind: "curl", amount: 0 });
    const hovering = useRef(false);
    const grab = useMemo(make_button_state, []);
    const trigger = useMemo(make_button_state, []);
    const hand = useMemo<Hand>(
        () => ({
            handedness,
            grip: grip as RefObject<Object3D | null>,
            ray: ray as RefObject<Object3D | null>,
            grab,
            trigger,
            pose,
            hovering
        }),
        [handedness, grab, trigger]
    );
    return { hand, state, grip, ray };
};

export const XRHandPointer = ({
   hand,
   input_source_state,
   ray_ref
}: {
    hand: Hand;
    input_source_state: any;
    ray_ref: RefObject<Group>;
}) => {
    const pointer = useRayPointer(hand.ray, input_source_state);

    useFrame(() => {
        // the ray pointer only intersects objects with a pointer-event listener, so an
        // in-range hit means "aimed at something clickable". a miss returns a void object
        // parked at a huge distance, hence the range check. this one flag drives the click,
        // the point pose (via hand.hovering) and the ray's visibility, so they stay in sync.
        const hit = pointer.getIntersection();
        const hovering = hit != null && hit.distance < MAX_POINT_DISTANCE;

        // only start a click while actually aimed at an in-range target
        if (hovering && hand.trigger.just_pressed) {
            pointer.down({ timeStamp: performance.now(), button: 0 });
        } else if (hand.trigger.just_released) {
            pointer.up({ timeStamp: performance.now(), button: 0 });
        }

        if (hand.hovering) hand.hovering.current = hovering;
        if (ray_ref.current) ray_ref.current.visible = hovering;
    });

    const target_ray_space = input_source_state.inputSource.targetRaySpace;

    return (
        <>
            {target_ray_space && (
                <XRSpace ref={ray_ref} space={target_ray_space}>
                    <PointerRayModel pointer={pointer} />
                </XRSpace>
            )}

            <PointerCursorModel pointer={pointer} />
        </>
    );
};

const FULL_CURL = 1.2;

export const XRHandsPublisher = () => {
    const left_slot = useXRHandSlot("left");
    const right_slot = useXRHandSlot("right");

    useFrame(() => {
        const active_slots = [left_slot, right_slot].filter(
            (slot) => slot.state
        );

        // update button edge states from the gamepad
        for (const slot of active_slots) {
            const gamepad = slot.state!.gamepad;
            update_button_state(
                slot.hand.grab,
                gamepad?.["xr-standard-squeeze"]?.state === "pressed"
            );
            update_button_state(
                slot.hand.trigger,
                gamepad?.["xr-standard-trigger"]?.state === "pressed"
            );
        }

        // point (curl 1.2) exactly when the ray is aimed at something clickable, else open (0).
        // hand.hovering is the same in-range hit that shows the ray, so pose and ray stay locked
        for (const slot of active_slots) {
            const curl_amount = slot.hand.hovering?.current ? FULL_CURL : 0;
            slot.hand.pose.current = { kind: "curl", amount: curl_amount };
        }
    });

    const set_hands = useSetHands();
    useEffect(() => {
        const connected: Hand[] = [];
        if (left_slot.state) connected.push(left_slot.hand);
        if (right_slot.state) connected.push(right_slot.hand);

        set_hands(prev => [...prev, ...connected]);
        return () => {
            set_hands(prev => prev.filter(hand => !connected.includes(hand)));
        };
    }, [
        left_slot.state,
        right_slot.state,
        left_slot.hand,
        right_slot.hand,
        set_hands
    ]);

    return (
        <>
            {left_slot.state && (
                <XRHandPointer
                    hand={left_slot.hand}
                    input_source_state={left_slot.state}
                    ray_ref={left_slot.ray as RefObject<Group>}
                />
            )}
            {right_slot.state && (
                <XRHandPointer
                    hand={right_slot.hand}
                    input_source_state={right_slot.state}
                    ray_ref={right_slot.ray as RefObject<Group>}
                />
            )}

            {left_slot.state?.inputSource.gripSpace && (
                <XRSpace
                    ref={left_slot.grip as RefObject<Group>}
                    space={left_slot.state.inputSource.gripSpace}
                />
            )}
            {right_slot.state?.inputSource.gripSpace && (
                <XRSpace
                    ref={right_slot.grip as RefObject<Group>}
                    space={right_slot.state.inputSource.gripSpace}
                />
            )}
        </>
    );
};