import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Object3D, Raycaster, Vector2 } from "three";

type R3FHandlers = Record<string, ((event: unknown) => void) | undefined>;

const get_handlers = (node: Object3D): R3FHandlers | undefined =>
    (node as { __r3f?: { handlers?: R3FHandlers } }).__r3f?.handlers;

/** Walk up from a hit looking for the nearest ancestor carrying `handler_name`. */
const find_handler_owner = (
    start: Object3D,
    handler_name: string
): { node: Object3D; handler: (event: unknown) => void } | null => {
    let node: Object3D | null = start;

    while (node) {
        const handler = get_handlers(node)?.[handler_name];
        if (handler) return { node, handler };
        node = node.parent;
    }

    return null;
};

// TODO: limit distance (with devtools bypass? but need to ensure not used in multiplayer to avoid easy cheats)
export const FlatClickRaycaster = () => {
    const { gl, camera, scene, events } = useThree();

    useEffect(() => {
        const canvas = gl.domElement;

        const sync = () => {
            const locked = document.pointerLockElement === canvas;
            if (locked) {
                // pointer locked, let us handle events ourselves
                events.disconnect?.();
            } else {
                // pointer freed, restore control to the default handlers so the user can click things
                if (!events.connected) {
                    events.connect?.(canvas);
                }
            }
        };

        document.addEventListener("pointerlockchange", sync);
        sync();

        return () => {
            document.removeEventListener("pointerlockchange", sync);
            if (!events.connected) {
                events.connect?.(canvas);
            }
        };
    }, [events, gl]);

    useEffect(() => {
        const canvas = gl.domElement;
        const raycaster = new Raycaster();
        const screen_center = new Vector2(0, 0);

        // The object that received pointerdown, so pointerup goes to the same place
        // even if the crosshair has since drifted off it.
        let held_node: Object3D | null = null;

        const cast_at_center = () => {
            raycaster.setFromCamera(screen_center, camera);
            return raycaster.intersectObjects(scene.children, true);
        };

        const dispatch_at_center = (handler_name: string) => {
            if (document.pointerLockElement !== canvas) return null;

            for (const hit of cast_at_center()) {
                if (!hit.object.visible) continue;

                const owner = find_handler_owner(hit.object, handler_name);
                if (!owner) continue;

                owner.handler({
                    ...hit,
                    object: hit.object,
                    eventObject: owner.node,
                    nativeEvent: undefined,
                    stopPropagation: () => {}
                });

                // only the nearest handler
                return owner.node;
            }

            return null;
        };

        const handle_pointer_down = (event: PointerEvent) => {
            if (event.button !== 0) return;
            held_node = dispatch_at_center("onPointerDown");
        };

        // Always release the node that was pressed, wherever the crosshair now points.
        const handle_pointer_up = () => {
            if (!held_node) return;

            const handler = get_handlers(held_node)?.onPointerUp;
            handler?.({
                object: held_node,
                eventObject: held_node,
                nativeEvent: undefined,
                stopPropagation: () => {}
            });

            held_node = null;
        };

        // "click" fires after pointer-lock is engaged, so the first lock-click
        // won't spuriously trigger a world click
        const fire_click_at_center = () => {
            dispatch_at_center("onClick");
        };

        canvas.addEventListener("pointerdown", handle_pointer_down);
        window.addEventListener("pointerup", handle_pointer_up);
        window.addEventListener("pointercancel", handle_pointer_up);
        canvas.addEventListener("click", fire_click_at_center);

        return () => {
            canvas.removeEventListener("pointerdown", handle_pointer_down);
            window.removeEventListener("pointerup", handle_pointer_up);
            window.removeEventListener("pointercancel", handle_pointer_up);
            canvas.removeEventListener("click", fire_click_at_center);
        };
    }, [gl, camera, scene]);

    return null;
};