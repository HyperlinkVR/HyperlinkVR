import { EngineObjectRenderer } from "./EngineObjectRenderer";
import { useEngineObjectStore } from "../stores/EngineObjectStore";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";

// how many queued objects to mount per frame
// mounting is a synchronous React commit (GLTF clone, collider build, first-draw shader compile), so a burst committed in one frame stalls
const SPAWN_BUDGET_PER_FRAME = 2;

export const EngineObjectSpawner = () => {
    const object_map = useEngineObjectStore((state) => state.objects);
    const objects = useMemo(() => Object.values(object_map), [object_map]);

    useFrame(() => {
        // read pending imperatively so this doesn't re-render on every enqueue
        if (useEngineObjectStore.getState().pending.length > 0) {
            useEngineObjectStore.getState().drain_pending(SPAWN_BUDGET_PER_FRAME);
        }
    });

    return (
        <>
            {objects.map((obj) => (
                <EngineObjectRenderer key={obj.id} data={obj} />
            ))}
        </>
    );
};
