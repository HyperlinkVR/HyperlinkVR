import { useSessionMode, useSetting } from "@hyperlinkvr/react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState, XRSpace } from "@react-three/xr";
import { RefObject, useCallback, useMemo, useRef } from "react";
import { Group, Vector3 } from "three";





export type HandAttachmentTarget =
    | "watch_hand"
    | "non_watch_hand"
    | "left"
    | "right";

interface UseXRHandAttachmentOptions {
    hand: HandAttachmentTarget;
    target_ref?: React.RefObject<Group | null>;
    target_follow?: boolean;
    offset?: Vector3;
}

export const useXRHandAttachment = ({
    hand,
    target_ref,
    target_follow = true,
    offset
}: UseXRHandAttachmentOptions) => {
    const [watch_hand] = useSetting("watch_hand");

    const resolved_hand = (() => {
        switch (hand) {
            case "watch_hand":
                return watch_hand;
            case "non_watch_hand":
                return watch_hand === "left" ? "right" : "left";
            case "left":
            case "right":
                return hand;
        }
    })();

    const controller = useXRInputSourceState("controller", resolved_hand);
    const ray_space_ref = useRef<Group>(null);
    const scratch = useRef(new Vector3());

    const get_hand_world_pos = useCallback(
        (out: Vector3): boolean => {
            if (!ray_space_ref.current) return false;

            ray_space_ref.current.getWorldPosition(out);
            if (out.lengthSq() === 0) return false;

            if (offset) {
                out.add(offset);
            }
            return true;
        },
        [offset]
    );

    useFrame(() => {
        if (!target_ref?.current || !target_follow) return;

        if (get_hand_world_pos(scratch.current)) {
            const parent = target_ref.current.parent;
            if (parent) {
                parent.worldToLocal(scratch.current);
            }

            target_ref.current.position.copy(scratch.current);
        }
    });

    const AnchorSpace = () =>
        controller ? (
            <XRSpace
                ref={ray_space_ref}
                space={controller.inputSource.targetRaySpace}
            />
        ) : null;

    return {
        AnchorSpace,
        get_hand_world_pos,
        controller,
        resolved_hand,
        ray_space_ref
    };
};

// TODO: is it worth abstracting so it works for flat hands too? probably eventually
