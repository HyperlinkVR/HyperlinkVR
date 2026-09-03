import type { CreatedEngineObject } from "@hyperlinkvr/vr-engine-schemas";
import { create } from "zustand";

interface EngineObjectState {
    // id->object data (mounted / live)
    objects: Record<string, CreatedEngineObject>;

    pending: CreatedEngineObject[];

    add_object: (obj: CreatedEngineObject) => void;
    // queue a new object for a future frame instead of mounting it immediately
    enqueue_object: (obj: CreatedEngineObject) => void;
    // move up to budget queued objects into the live set
    drain_pending: (budget: number) => void;
    remove_object: (id: string) => void;
    get_object: (id: string) => CreatedEngineObject | null;

    clear_all_objects: () => void;
}

export const useEngineObjectStore = create<EngineObjectState>((set, get) => ({
    objects: {},
    pending: [],

    // immediate mount. used for in-place updates (modify/transform) of objects that already exist, where there's no new subtree to build so no reason to defer
    add_object: (obj) =>
        set((state) => ({
            objects: { ...state.objects, [obj.id]: obj }
        })),

    enqueue_object: (obj) =>
        set((state) => ({ pending: [...state.pending, obj] })),

    drain_pending: (budget) =>
        set((state) => {
            if (state.pending.length === 0 || budget <= 0) return state;
            const take = state.pending.slice(0, budget);
            const rest = state.pending.slice(budget);
            const objects = { ...state.objects };
            for (const obj of take) {
                objects[obj.id] = obj;
            }
            return { objects, pending: rest };
        }),

    remove_object: (id) =>
        set((state) => {
            const next = { ...state.objects };
            delete next[id];
            // also drop it if it was destroyed before it ever got mounted
            const pending = state.pending.some((o) => o.id === id)
                ? state.pending.filter((o) => o.id !== id)
                : state.pending;
            return { objects: next, pending };
        }),

    get_object: (id) => {
        const obj = get().objects[id];
        if (!obj) {
            return null;
        }
        return obj;
    },

    clear_all_objects: () =>
        set(() => ({
            objects: {},
            pending: []
        }))
}));
