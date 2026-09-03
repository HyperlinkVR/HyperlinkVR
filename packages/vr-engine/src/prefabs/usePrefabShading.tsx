import { HexColor, PrefabShading } from "@hyperlinkvr/vr-engine-schemas";
import { useMemo } from "react";
import { MeshStandardMaterial } from "three";



export const usePrefabShading = (shading: PrefabShading, color: HexColor) => {
    // TODO: can this be done more optimally
    const shading_material = useMemo(() => {
        switch (shading.type) {
            case "unshaded":
                // drei defaults to basic mat
                return undefined;
            case "standard":
                return new MeshStandardMaterial({
                    color: color,
                    roughness: shading.roughness,
                    metalness: shading.metalness,
                });
            case "emissive":
                return new MeshStandardMaterial({
                    color: color,
                    emissive: shading.emissive_color_override ?? color,
                    emissiveIntensity: shading.emissive_intensity
                });
            default:
                console.warn("Unknown shading type", shading);
                return undefined;
        }
    }, [shading, color]);

    return shading_material;
}

export const usePrefabShadingComponent = (shading: PrefabShading, color: HexColor) => {
    // TODO: can this be done more optimally
    const shading_material_component = useMemo(() => {
        switch (shading.type) {
            case "unshaded":
                return <meshBasicMaterial color={color} />;
            case "standard":
                return (
                    <meshStandardMaterial
                        color={color}
                        roughness={shading.roughness}
                        metalness={shading.metalness}
                    />
                );
            case "emissive":
                return (
                    <meshStandardMaterial
                        color={color}
                        emissive={shading.emissive_color_override ?? color}
                        emissiveIntensity={shading.emissive_intensity}
                    />
                );
            default:
                console.warn("Unknown shading type", shading);
                return undefined;
        }
    }, [shading, color]);

    return shading_material_component;
}
