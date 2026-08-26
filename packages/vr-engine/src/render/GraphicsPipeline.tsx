import { useThree } from "@react-three/fiber";
import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Pass } from "three/examples/jsm/postprocessing/Pass";

// reserved ordering bands so effects land in a fixed pipeline stage regardless of mount order,
// and authored VFX can never end up before the scene render or after the quality/output passes
export const PASS_ORDER = {
    render: 0,
    vfx_base: 200,      // authored declarative effects
    impulse: 800,       // authored impulse (shake, flash)
    quality: 900,
    output: 1000
} as const;


interface GraphicsPipelineContextType {
    claim: () => number;
    set_pass: (pass: Pass, order: number) => void;
    remove_pass: (pass: Pass) => void;
}

const GraphicsPipelineContext = createContext<GraphicsPipelineContextType | null>(null);

export const active_pipeline = { passes: [] as Pass[] };

export const GraphicsPipeline = ({ children }: { children: React.ReactNode }) => {
    const gl = useThree((s) => s.gl);
    const passes_ref = useRef<{ pass: Pass; order: number; seq: number }[]>([]);
    const order_counter = useRef(0);
    const seq_counter = useRef(0);
    const api = useMemo(() => {
        const sync = () => {
            const ordered = [...passes_ref.current]
                // order is the band, seq (insertion) is a stable tie-break so equal orders never reshuffle between syncs
                .sort((a, b) => a.order - b.order || a.seq - b.seq)
                .map((p) => p.pass);

            active_pipeline.passes = ordered;
            gl.setEffects(ordered);
        }
        return {
            claim: () => order_counter.current++,
            set_pass: (pass: Pass, order: number) => {
                const existing = passes_ref.current.find((p) => p.pass === pass);
                if (existing) {
                    existing.order = order;
                } else {
                    passes_ref.current.push({ pass, order, seq: seq_counter.current++ });
                }
                sync();
            },
            remove_pass: (pass: Pass) => { passes_ref.current = passes_ref.current.filter((p) => p.pass !== pass); sync(); },
        };
    }, [gl]);
    return <GraphicsPipelineContext.Provider value={api}>{children}</GraphicsPipelineContext.Provider>;
};

export const usePass = (pass: Pass, order_band?: number) => {
    const api = useContext(GraphicsPipelineContext);
    if (!api) throw new Error("Pass must be inside <GraphicsPipeline>");
    const [claimed] = useState(() => api.claim()); // mount-order fallback
    const resolved = order_band ?? claimed;
    useLayoutEffect(() => {
        api.set_pass(pass, resolved);
        return () => api.remove_pass(pass);
    }, [api, pass, resolved]);
};
