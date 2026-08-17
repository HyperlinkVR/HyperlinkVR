import { useSetting } from "@hyperlinkvr/react";
import { Text, useGLTF } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";



import { FollowPlayer } from "../interaction/FollowPlayer";
import { Grabbable } from "../interaction/Grabbable";
import { LayerGroup } from "../render/LayerGroup";
import { Layer } from "../render/layers";
import { MixedRealityCameraController } from "../render/MixedRealityCameraController";
import { camera_controller_configs, SpectatorCameraController } from "../render/SpectatorCameraController";
import { EnhancedBillboard } from "../interaction";


const camera = new URL("../../assets/misc/camera/camera.glb", import.meta.url).href;

export const SpectatorCamera = () => {
    const [mode] = useSetting("spectator_view");

    const [horiz_fov] = useSetting("third_person_fov");
    const [follow_player, setFollowPlayer] = useState(true);
    // TODO: option to look at what the player is holding automatically?

    const {scene: camera_scene} = useGLTF(camera);

    const camera_model_ref = useRef<Group>(null);

    const config = useMemo(() => {
        if (mode === "first_person") {
            return camera_controller_configs.first_person();
        } else if (mode === "third_person" || mode === "mixed_reality") {
            return camera_controller_configs.third_person_from_object(
                camera_model_ref
            );
        } else {
            throw new Error(`Unknown spectator_view mode: ${mode}`);
        }
    }, [mode]);
// TODO: might want to actually hide from the first person cam too for MR mode
    return (
        <>
            <LayerGroup
                layers={[Layer.ThirdPerson_ForceHide]}
                visible={mode !== "first_person"}
            >
                <FollowPlayer
                    enabled={mode === "mixed_reality" || follow_player}
                    position={[0.5, 1, 0.1]}
                    rotation={[0, Math.PI/12, 0]}
                >
                    <Grabbable
                        ref={camera_model_ref}
                        on_trigger_start={() => setFollowPlayer(!follow_player)}
                        grab_distance={0.25}
                        enabled={mode !== "first_person"}
                        snap_to_hand={false}
                    >
                        {mode !== "mixed_reality" && (
                            <EnhancedBillboard
                                position={[0, -0.1, 0]}
                                userData={{_exclude_from_bounds: true}}
                            >
                                <Text fontSize={0.025} textAlign="center">{follow_player ? "Following" : "Static"}{"\n"}Grab and press trigger to toggle</Text>
                            </EnhancedBillboard>
                        )}

                        <primitive object={camera_scene} />
                    </Grabbable>
                </FollowPlayer>
            </LayerGroup>

            {mode !== "mixed_reality" ? (
                <SpectatorCameraController config={config} horizontal_fov={mode !== "first_person" ? horiz_fov : 80} />
            ) : (
                <MixedRealityCameraController third_person_transform={config.frame_transform} third_person_horizontal_fov={horiz_fov} />
            )}
        </>
    );
};
// TODO: option to toggle between follow origin and staying static with trigger (show text that faces you with "Following")
// TODO: fix position of grabbable and the actual camera with locomotion now enabled

// TODO: full scene re-render happens when this changes!!!!!!!
