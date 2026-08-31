import { Text } from "@react-three/drei";
import { useEffect, useState } from "react";
import { configureTextBuilder } from "troika-three-text";

import { useWorldSession } from "@hyperlinkvr/react";

// its not happy! turn off web workers
configureTextBuilder({
    useWorker: false
});

export const URLBar = ({position, height, height_of_dom_mirror}: {position: [number, number, number]; height: number; height_of_dom_mirror: number}) => {
    const session = useWorldSession();
    const [width, setWidth] = useState(0);
    
    useEffect(() => {
        if (!session.tab_dimensions) return;

        const new_width = (session.tab_dimensions.width / session.tab_dimensions.height) * height_of_dom_mirror;
        setWidth(new_width);
    }, [session.tab_dimensions, height_of_dom_mirror]);
    
    return (
        <>
            <mesh position={[
                position[0],
                position[1],
                position[2] - 0.01
            ]}>
                <boxGeometry args={[width, height, 0.01]} />
                <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
            </mesh>

            <Text position={position} color="black" anchorX="center" anchorY="middle" fontSize={height * 0.5} maxWidth={width * 0.9}>
                {session.url || "..."}
            </Text>
        </>
    );
}
