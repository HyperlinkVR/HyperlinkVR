import { useThree } from "@react-three/fiber";
import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Pass } from "three/examples/jsm/postprocessing/Pass";





interface GraphicsPipelineContextType {
    claim: () => number;
    add_pass: (pass: Pass, index: number) => void;
    remove_pass: (pass: Pass) => void;
}

const GraphicsPipelineContext = createContext<GraphicsPipelineContextType | null>(null);

export const active_pipeline = { passes: [] as Pass[] };

export const GraphicsPipeline = ({ children }: { children: React.ReactNode }) => {
    const gl = useThree((s) => s.gl);
    const passes_ref = useRef<{ pass: Pass; order: number }[]>([]);
    const order_counter = useRef(0);
    const api = useMemo(() => {
        const sync = () => {
            const ordered = [...passes_ref.current]
                .sort((a, b) => a.order - b.order)
                .map((p) => p.pass);

            active_pipeline.passes = ordered;
            gl.setEffects(ordered);
        }
        return {
            claim: () => order_counter.current++,
            add_pass: (pass: Pass, order: number) => { passes_ref.current.push({ pass, order }); sync(); },
            remove_pass: (pass: Pass) => { passes_ref.current = passes_ref.current.filter((p) => p.pass !== pass); sync(); },
        };
    }, [gl]);
    return <GraphicsPipelineContext.Provider value={api}>{children}</GraphicsPipelineContext.Provider>;
};

// A helper hook for passes to use
export const usePass = (pass: Pass) => {
    const api = useContext(GraphicsPipelineContext);
    if (!api) throw new Error("Pass must be inside <GraphicsPipeline>");
    const [order] = useState(() => api.claim()); // assigned ONCE, on first render
    useLayoutEffect(() => {
        api.add_pass(pass, order);
        return () => api.remove_pass(pass);
    }, [api, pass, order]);
};