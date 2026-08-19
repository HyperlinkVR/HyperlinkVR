import { useFrame } from "@react-three/fiber";
import { useState } from "react";

import {
    ObjectRefsContextType,
    useObjectRefs,
} from "../contexts";


const ready_ids = new Set<string>();
const waiters = new Map<string, Set<() => void>>();

export const mark_object_ready = (object_id: string) => {
    ready_ids.add(object_id);
    const notifiers = waiters.get(object_id);
    if (notifiers) {
        notifiers.forEach((notify) => notify());
        waiters.delete(object_id);
    }
};

export const clear_object_ready = (object_id: string) => {
    ready_ids.delete(object_id);
    waiters.delete(object_id);
};

// resolves on timeout too, so a broken mesh url doesn't block the entire world from loading
export const wait_for_object_ready = (object_id: string, timeout_ms = 15000) => {
    if (ready_ids.has(object_id)) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        const notify = () => {
            clearTimeout(timeout_handle);
            resolve();
        };

        const timeout_handle = setTimeout(() => {
            waiters.get(object_id)?.delete(notify);
            console.warn(`Timed out waiting for object ${object_id} to become ready`);
            resolve();
        }, timeout_ms);

        const notifiers = waiters.get(object_id) ?? new Set();
        notifiers.add(notify);
        waiters.set(object_id, notifiers);
    });
};

export const ObjectReadyMarker = ({
    object_id,
    has_physics
}: {
    object_id: string;
    has_physics: boolean;
}) => {
    const [polling, setPolling] = useState(true);
    const refs = useObjectRefs();

    // fully unmount poller once ready to avoid dormant useFrames
    return polling ? (
        <ObjectReadyPoll
            refs={refs}
            has_physics={has_physics}
            on_ready={() => {
                mark_object_ready(object_id);
                setPolling(false);
            }}
        />
    ) : null;
};

const ObjectReadyPoll = ({
    refs,
    has_physics,
    on_ready
}: {
    refs: ObjectRefsContextType;
    has_physics: boolean;
    on_ready: () => void;
}) => {
    useFrame(() => {
        const body = refs?.rigid_body.current;

        // custom objects declare physics up front with has_physics, so wait even before the body has mounted
        // prefabs don't declare it but their ObjectPhysics populates refs.rigid_body on mount, so a present body means we should wait on its colliders
        if (has_physics && !body) return;
        if (body && body.numColliders() === 0) return;

        // no physics body expected or present so ready on the first frame, as before
        on_ready();
    });

    return null;
};
