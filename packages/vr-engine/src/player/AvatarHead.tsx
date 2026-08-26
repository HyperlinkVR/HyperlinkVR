import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Group } from "three";



import { useAvatarMaterials } from "../contexts/AvatarContext";
import { ObjectPhysics } from "../engine/ObjectPhysics";
import { PLAYER_COLLISION_GROUPS } from "../physics/collision_groups";
import { LayerGroup } from "../render/LayerGroup";
import { Layer } from "../render/layers";
import { AvatarExpression } from "./AvatarExpression";
import { AvatarHair } from "./AvatarHair";


const head = new URL("../../assets/player/head/head.glb", import.meta.url).href;

export const AvatarHead = () => {
    const {scene: head_scene} = useGLTF(head);
    const anchor_ref = useRef<Group>(null);

    // follow vr headset position and rotation
    useFrame(({camera}) => {
        if (!anchor_ref.current) return;

        camera.getWorldPosition(anchor_ref.current.position);
        camera.getWorldQuaternion(anchor_ref.current.quaternion);

        //group_ref.current.updateWorldMatrix(true, false);
    });

    // apply skin colour
    useAvatarMaterials(head_scene);

    // cast shadow
    useEffect(() => {
        head_scene.traverse((child) => {
            if (child instanceof Group) return;
            child.castShadow = true;
        });
    }, [head_scene]);
    
    return (
        <LayerGroup layers={[Layer.PlayerModel_Head]}>
            <group ref={anchor_ref} />
            <ObjectPhysics
                body_name="avatar_head_rb"
                collision_groups={PLAYER_COLLISION_GROUPS}
                physics={{
                    rigid_body: {
                        type: "kinematic-pos",
                        collider: { type: "auto" }
                    }
                }}
                kinematic_pos_tracking_ref={anchor_ref}
            >
                <AvatarHair />

                <primitive object={head_scene} />

                <AvatarExpression />
            </ObjectPhysics>
        </LayerGroup>
    );
}
