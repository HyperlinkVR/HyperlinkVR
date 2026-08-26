import { useGLTF } from "@react-three/drei";
import { useAvatarMaterials } from "../contexts/AvatarContext";
import { useEffect } from "react";
import { Group } from "three";


const hair = new URL("../../assets/player/hair/0.glb", import.meta.url).href;

export const AvatarHair = () => {
    const {scene: hair_scene} = useGLTF(hair);

    // apply hair colour
    useAvatarMaterials(hair_scene);

    // cast shadow
    useEffect(() => {
        hair_scene.traverse((child) => {
            if (child instanceof Group) return;
            child.castShadow = true;
        });
    }, [hair_scene]);
    
    return <primitive object={hair_scene} />;
}
