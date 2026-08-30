import type { ObjectRefsContextType } from "../contexts/ObjectRefsContext";
import { RefObject } from "react";

const registry = new Map<string, RefObject<ObjectRefsContextType>>();

export const register_object_refs = (refs: RefObject<ObjectRefsContextType>) => {
    registry.set(refs.current.id, refs);
    return () => {
        registry.delete(refs.current.id);
    };
};

export const get_object_refs = (id: string): RefObject<ObjectRefsContextType> | null => registry.get(id) ?? null;
