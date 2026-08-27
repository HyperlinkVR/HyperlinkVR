import { instrument, secure, traverseRenderedFibers } from "bippy";
import type { Object3D } from "three";

export type FlashEntry = { count: number; last: number };
export const flashes = new Map<Object3D, FlashEntry>();
let scanning = false;
export const set_scanning = (on: boolean) => {
    scanning = on;
    if (!on) flashes.clear();
};

const fiber_to_object = (fiber: any): Object3D | null => {
    const sn = fiber?.stateNode;
    if (!sn) return null;
    if (sn.isObject3D) return sn as Object3D;
    if (sn.object?.isObject3D) return sn.object as Object3D;
    return null;
};

// install hook before canvas mounts
instrument(secure({
    onCommitFiberRoot(_rendererID, root) {
        if (!scanning) return;
        const now = performance.now();
        traverseRenderedFibers(root, (fiber) => {
            const obj = fiber_to_object(fiber);
            if (!obj) return;
            const entry = flashes.get(obj);
            if (entry) { entry.count++; entry.last = now; }
            else { flashes.set(obj, { count: 1, last: now }); }
        });
    }
}));
