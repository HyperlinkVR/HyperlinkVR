import type { RapierRigidBody } from "@react-three/rapier";
import type { RefObject} from "react";
import { createContext, useContext } from "react";
import type {Group} from "three";

export interface ObjectRefsContextType {
    id: string;
    root: RefObject<Group | null>;
    rigid_body: RefObject<RapierRigidBody | null>;
    constrained: RefObject<boolean>;
    user_data: Record<string, any>;
}

const ObjectRefsContext = createContext<ObjectRefsContextType | null>(null);

export const ObjectRefsProvider = ObjectRefsContext.Provider;

export const useObjectRefs = () => {
    const context = useContext(ObjectRefsContext);
    if (!context) {
        throw new Error("useObjectRefs must be used within an ObjectRefsProvider");
    }
    return context;
}

export const useObjectRefsOptional = () => {
    const context = useContext(ObjectRefsContext);
    return context;
}

export const create_object_refs = (id: string): ObjectRefsContextType => {
    return {
        id,
        root: { current: null },
        rigid_body: { current: null },
        constrained: { current: false },
        user_data: {},
    };
}
