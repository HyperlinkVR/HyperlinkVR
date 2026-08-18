import {useFrame, useThree} from "@react-three/fiber";
import {useRef} from "react";
import {BackSide, Group} from "three";
import {get_united_head_camera} from "../util/get_head_cameras";
import {Layer, LayerGroup} from "../render";
import {useTabSession} from "@hyperlinkvr/react";
import {LoadingSpinner} from "@hyperlinkvr/ui-dom";
import { Text } from "@react-three/drei";

const loader_svg = new URL("../../../assets/hyperlinkvr_anim.svg", import.meta.url).href;

export const VRLoadingScreen = () => {
    const { gl, camera } = useThree();
    const group_ref = useRef<Group>(null);

    useFrame(() => {
        const group = group_ref.current;
        if (!group) return;

        const head_camera = get_united_head_camera(gl, camera);
        head_camera.getWorldPosition(group.position);
    });

    const {url} = useTabSession();

    return (
        <LayerGroup ref={group_ref} layers={[Layer.Loader]}>
            <mesh>
                <sphereGeometry args={[2, 32, 16]} />
                <meshBasicMaterial color="#111111" side={BackSide} fog={false} />
            </mesh>

            <Text color="white" fontSize={0.1} position={[0, 0, -1]} anchorX="center" anchorY="middle" fontWeight="bold">
                Loading world...
            </Text>

            <Text color="white" fontSize={0.05} position={[0, -0.2, -1]} anchorX="center" anchorY="middle">
                {url}
            </Text>

            {/* TODO: loading animated svg, but prob needs conversion where we re-implement the animation in threejs */}
        </LayerGroup>
    );
}

export const FlatLoadingScreen = () => {
    const {url} = useTabSession();

    return (
        <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center gap-2 bg-[#111111] z-5 text-white font-sans">
            <img src={loader_svg} alt="Loading..." className="w-32 h-32" />

            <LoadingSpinner />

            <p className="font-bold text-xl text-center mt-4">Loading world{" "}
                <span className="animate-pulse">...</span>
            </p>
            <p className="text-sm text-center">{url}</p>
        </div>
    )
}

// TODO: different loading verbs for fun :) (or could be more specific about what's happening, but that's more difficult without synced context)
