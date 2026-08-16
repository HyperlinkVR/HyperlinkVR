import {useGLTF} from "@react-three/drei";
import {ObjectPhysics} from "../engine/ObjectPhysics";

const MESH_URL = new URL("../../assets/prefabs/golf_ball/golf_ball.glb", import.meta.url).href;

export const GolfBall = () => {
    const {scene} = useGLTF(MESH_URL);
    const instance = scene.clone(true);

    return (
        <ObjectPhysics physics={{
            rigid_body: {
                type: "dynamic",
                mass: 0.045,
                restitution: 0.7,
                friction: 0.5,
                ccd: true,
                collider: {
                    type: "sphere",
                    radius: 0.03
                }

                // TODO: ignore player collision
            }
        }}>
            <primitive object={instance} />
        </ObjectPhysics>
    );
}
