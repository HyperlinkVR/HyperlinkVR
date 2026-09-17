import { Suspense, useMemo } from "react";



import { GadgetName, usePlayerGadgets } from "../contexts/PlayerGadgetsContext";
import { PhotoCamera } from "./PhotoCamera";


const GADGET_COMPONENTS = {
    camera: PhotoCamera,
};

const GadgetComponent = ({gadget}: {gadget: GadgetName}) => {
    const Component = useMemo(() => GADGET_COMPONENTS[gadget], [gadget]);

    if (!Component) {
        console.warn(`No component found for gadget: ${gadget}`);
        return null;
    }

    return <Component />;
};

const SuspendedGadget = ({gadget}: {gadget: GadgetName}) => (
    <Suspense fallback={null}>
        <GadgetComponent gadget={gadget} />
    </Suspense>
);

export const Gadgets = () => {
    const {active_gadgets} = usePlayerGadgets();

    return (
        <group name="GadgetsRoot">
            {Object.entries(active_gadgets).map(([gadget, {active, spawn_key}]) => (
                active && <SuspendedGadget gadget={gadget as GadgetName} key={spawn_key} />
            ))}
        </group>
    );
}
