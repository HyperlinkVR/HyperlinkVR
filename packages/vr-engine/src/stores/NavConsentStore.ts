import { create } from "zustand";

interface NavConsentStore {
    approved_generation: number | null;
    approve: (generation: number) => void;
}

export const useNavConsentStore = create<NavConsentStore>((set) => ({
    approved_generation: null,
    approve: (generation) => set({ approved_generation: generation })
}));
