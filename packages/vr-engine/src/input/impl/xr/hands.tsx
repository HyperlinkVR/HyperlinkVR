import { useSetting } from "@hyperlinkvr/react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerCursorModel, PointerRayModel, useRayPointer, useXRInputSourceState, XRSpace } from "@react-three/xr";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Group, Object3D} from "three";
import { Quaternion, Raycaster, Vector3 } from "three";



import { make_button_state, update_button_state, useSetHands, type Hand, type HandPose } from "../../hands";


const useXRHandSlot = (handedness: "left" | "right") => {
    const state = useXRInputSourceState("controller", handedness);
    const grip = useRef<Group>(null);
    const ray = useRef<Group>(null);
    const pose = useRef<HandPose>({ kind: "curl", amount: 0 });
    const grab = useMemo(make_button_state, []);
    const trigger = useMemo(make_button_state, []);
    const hand = useMemo<Hand>(
        () => ({
            handedness,
            grip: grip as RefObject<Object3D | null>,
            ray: ray as RefObject<Object3D | null>,
            grab,
            trigger,
            pose
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
        if (hand.trigger.just_pressed) {
            pointer.down({ timeStamp: performance.now(), button: 0 });
        } else if (hand.trigger.just_released) {
            pointer.up({ timeStamp: performance.now(), button: 0 });
        }
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

const FORWARD = new Vector3(0, 0, -1);

const WATCH_PROXIMITY_CURL_DISTANCE = 0.3;
const FULL_CURL = 1.2;

export const XRHandsPublisher = () => {
    const { scene } = useThree();
    const [watch_hand] = useSetting("watch_hand");

    const left_slot = useXRHandSlot("left");
    const right_slot = useXRHandSlot("right");

    const scratch = useMemo(
        () => ({
            raycaster: new Raycaster(),
            hand_world_pos: new Vector3(),
            ray_world_quat: new Quaternion(),
            watch_world_pos: new Vector3(),
            ray_direction: new Vector3()
        }),
        []
    );

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

        // resolve display curl: 1.2 when near the watch hand or pointing at UI, else 0
        for (const slot of active_slots) {
            let curl_amount = 0;
            const grip_node = slot.hand.grip.current;
            const ray_node = slot.hand.ray.current;
            const is_pointer_hand =
                slot.hand.handedness !== (watch_hand || "left");

            // proximity to the watch hand's grip
            if (is_pointer_hand && grip_node) {
                const watch_slot = active_slots.find(
                    (candidate) =>
                        candidate.hand.handedness === (watch_hand || "left")
                );
                if (watch_slot?.hand.grip.current) {
                    grip_node.getWorldPosition(scratch.hand_world_pos);
                    watch_slot.hand.grip.current.getWorldPosition(
                        scratch.watch_world_pos
                    );

                    if (
                        scratch.hand_world_pos.distanceTo(
                            scratch.watch_world_pos
                        ) < WATCH_PROXIMITY_CURL_DISTANCE
                    ) {
                        curl_amount = FULL_CURL;
                    }
                }
            }

            // ray pointing at the browser mirror or watch UI (TODO: do this for buttons etc when added, maybe just make it a userData flag but perfomant somehow)
            if (curl_amount === 0 && ray_node) {
                ray_node.getWorldPosition(scratch.hand_world_pos);
                ray_node.getWorldQuaternion(scratch.ray_world_quat);
                scratch.ray_direction
                    .copy(FORWARD)
                    .applyQuaternion(scratch.ray_world_quat);
                scratch.raycaster.set(
                    scratch.hand_world_pos,
                    scratch.ray_direction
                );

                const interactables = ["DOMMirror", "WatchUI"]
                    .map((name) => scene.getObjectByName(name))
                    .filter(Boolean) as Object3D[];

                if (
                    interactables.length &&
                    scratch.raycaster.intersectObjects(interactables, true)
                        .length
                ) {
                    curl_amount = FULL_CURL;
                }
            }

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