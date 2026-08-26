import { create } from "zustand";

import type { VFXStack } from "@hyperlinkvr/vr-engine-schemas";

interface VFXStoreState {
    stack: VFXStack;
    set_stack: (stack: VFXStack) => void;
    clear: () => void;
}

export const useVFXStore = create<VFXStoreState>((set) => ({
    stack: [],
    set_stack: (stack) => set({ stack }),
    clear: () => set({ stack: [] })
}));
