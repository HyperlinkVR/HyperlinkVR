import { useSetting } from "@hyperlinkvr/react";
import { Text, useGLTF } from "@react-three/drei";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Group } from "three";



import { FollowPlayer } from "../interaction/FollowPlayer";
import { Grabbable, GrabbableRef } from "../interaction/Grabbable";
import { LayerGroup } from "../render/LayerGroup";
import { Layer } from "../render/layers";
import { MixedRealityCameraController } from "../render/MixedRealityCameraController";
import { camera_controller_configs, SpectatorCameraController } from "../render/SpectatorCameraController";
import { EnhancedBillboard } from "../interaction";


const camera = new URL("../../assets/misc/camera/camera.glb", import.meta.url).href;

const SpectatorCameraInternal = () => {
    const [mode] = useSetting("spectator_view");

    const [horiz_fov] = useSetting("third_person_fov");
    const [follow_player, setFollowPlayer] = useState(true);
    // TODO: option to look at what the player is holding automatically?

    const {scene: camera_scene} = useGLTF(camera);

    const camera_model_ref = useRef<Group>(null);
    const on_camera_ref = useCallback(
        (grabbable: GrabbableRef) => {
            if (!grabbable) {
                return;
            }

            camera_model_ref.current = grabbable.group;
        },
        []
    )

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
                        ref={on_camera_ref}
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

export const SpectatorCamera = () => {
    const [mode] = useSetting("spectator_view");

    if (mode === "off") {
        return null;
    }

    return <SpectatorCameraInternal />;
}

// TODO: full scene re-render happens when this changes!!!!!!!
