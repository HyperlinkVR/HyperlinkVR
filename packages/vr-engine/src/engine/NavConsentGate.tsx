import { useMessageEngine, useWorldSession } from "@hyperlinkvr/react";
import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import { BackSide, type Group, Mesh, MeshBasicMaterial } from "three";

import { get_united_head_camera } from "../util/get_head_cameras";
import { Layer, LayerGroup } from "../render";
import { useNavConsentStore } from "../stores/NavConsentStore";


export interface NavConsent {
    blocked: boolean;
    url: string | null;
    approve: () => void;
    leave: () => void;
}

export const useNavConsent = (): NavConsent => {
    const { id: tab_id, url, doc_generation, nav_authorised } = useWorldSession();
    const messenger = useMessageEngine();

    const approved_generation = useNavConsentStore((s) => s.approved_generation);
    const approve_generation = useNavConsentStore((s) => s.approve);

    // block when the extension didn't initiate this navigation and the user hasn't approved this specific document yet
    const blocked = !nav_authorised && approved_generation !== doc_generation;

    const approve = useCallback(() => {
        approve_generation(doc_generation);
        if (url) {
            messenger
                .send({ action: "HVR_NAV_CONSENT", tab: tab_id, url })
                .catch(() => {
                    // best effort, the world will still loads, just consent won't be remembered
                });
        }
    }, [approve_generation, doc_generation, messenger, tab_id, url]);

    const leave = useCallback(() => {
        messenger.send({ action: "HVR_NAV_BACK", tab: tab_id }).catch(() => {});
    }, [messenger, tab_id]);

    return { blocked, url, approve, leave };
};

const set_button_color = (e: { object: unknown }, color: string) => {
    const mesh = e.object as Mesh;
    if (mesh instanceof Mesh && mesh.material instanceof MeshBasicMaterial) {
        mesh.material.color.set(color);
    }
};

const GateButton = ({
    label,
    position,
    color,
    hover_color,
    on_click
}: {
    label: string;
    position: [number, number, number];
    color: string;
    hover_color: string;
    on_click: () => void;
}) => (
    <mesh
        position={position}
        onClick={on_click}
        onPointerOver={(e) => set_button_color(e, hover_color)}
        onPointerOut={(e) => set_button_color(e, color)}>
        <planeGeometry args={[0.75, 0.22]} />
        <meshBasicMaterial color={color} fog={false} />
        <Text position={[0, 0, 0.01]} fontSize={0.07} color="white" anchorX="center" anchorY="middle">
            {label}
        </Text>
    </mesh>
);

export const VRNavConsentGate = () => {
    const { gl, camera } = useThree();
    const group_ref = useRef<Group>(null);
    const { url, approve, leave } = useNavConsent();

    useFrame(() => {
        const group = group_ref.current;
        if (!group) return;

        const head_camera = get_united_head_camera(gl, camera);
        head_camera.getWorldPosition(group.position);
    });

    return (
        <LayerGroup ref={group_ref} layers={[Layer.Loader]}>
            <mesh>
                <sphereGeometry args={[2, 32, 16]} />
                <meshBasicMaterial color="#0a0a0a" side={BackSide} fog={false} />
            </mesh>

            <Text color="#ffcc55" fontSize={0.06} position={[0, 0.42, -1]} anchorX="center" anchorY="middle" fontWeight="bold">
                A world tried to send you here
            </Text>

            <Text color="#aaaaaa" fontSize={0.038} position={[0, 0.08, -1]} anchorX="center" anchorY="middle" maxWidth={1.8}>
                {url ?? ""}
            </Text>

            <GateButton
                label="Enter"
                position={[-0.45, -0.18, -1]}
                color="#2563eb"
                hover_color="#3b82f6"
                on_click={approve}
            />
            <GateButton
                label="Go back"
                position={[0.45, -0.18, -1]}
                color="#3f3f46"
                hover_color="#52525b"
                on_click={leave}
            />
        </LayerGroup>
    );
};

export const FlatNavConsentGate = () => {
    const { blocked, url, approve, leave } = useNavConsent();

    if (!blocked) {
        return null;
    }

    return (
        <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center gap-2 bg-[#0a0a0a]/95 z-10 text-white font-sans px-6">
            <p className="text-[#ffcc55] font-bold text-sm tracking-wide uppercase">
                A world tried to send you here
            </p>

            <p className="text-sm text-center text-white/60 break-all max-w-xl">{url}</p>

            <div className="flex gap-4 mt-6">
                <button
                    onClick={approve}
                    className="px-6 py-3 bg-blue-600 rounded hover:bg-blue-500 transition cursor-pointer font-medium">
                    Enter
                </button>
                <button
                    onClick={leave}
                    className="px-6 py-3 bg-zinc-700 rounded hover:bg-zinc-600 transition cursor-pointer font-medium">
                    Go back
                </button>
            </div>
        </div>
    );
};
