import { PerspectiveCamera, useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Container, Image, Text } from "@react-three/uikit";
import { Button } from "@react-three/uikit-default";
import { RefObject, useCallback, useMemo, useRef, useState } from "react";
import { DataTexture, LinearFilter, Mesh, PerspectiveCamera as PerspectiveCameraType, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";



import { HypergramProvider, useHypergram } from "../contexts/HypergramContext";
import { Grabbable } from "../interaction";
import { compute_layer_mask, Layer } from "../render";
import { active_pipeline } from "../render/GraphicsPipeline";


const DISPLAY_ASPECT = 16 / 9;

const LOW_RES_HEIGHT = 270;
const LOW_RES_WIDTH = Math.floor(LOW_RES_HEIGHT * DISPLAY_ASPECT);

const HIGH_RES_HEIGHT = 1080;
const HIGH_RES_WIDTH = Math.floor(HIGH_RES_HEIGHT * DISPLAY_ASPECT);

const LAYER_MASK = compute_layer_mask([
    Layer.Default,
    Layer.PlayerModel_TorsoAndHands,
    Layer.PlayerModel_Head,
    Layer.NoVFX
]);

const buffer_to_canvas = (buffer: Uint8Array) => {
    const canvas = document.createElement("canvas");
    canvas.width = HIGH_RES_WIDTH;
    canvas.height = HIGH_RES_HEIGHT;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // flip y axis
    const flipped_buffer = new Uint8Array(HIGH_RES_WIDTH * HIGH_RES_HEIGHT * 4);
    const row_size = HIGH_RES_WIDTH * 4;

    for (let y = 0; y < HIGH_RES_HEIGHT; y++) {
        const src_row = y * row_size;
        const dest_row = (HIGH_RES_HEIGHT - 1 - y) * row_size;
        flipped_buffer.set(
            buffer.subarray(src_row, src_row + row_size),
            dest_row
        );
    }

    const image_data = new ImageData(
        new Uint8ClampedArray(flipped_buffer),
        HIGH_RES_WIDTH,
        HIGH_RES_HEIGHT
    );

    ctx.putImageData(image_data, 0, 0);

    return canvas;
};

const download_image_buffer = (buffer: Uint8Array) => {
    const canvas = buffer_to_canvas(buffer);
    if (!canvas) return;

    const data_url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `photo-${Date.now()}.png`;
    link.href = data_url;
    link.click();
}

const image_buffer_to_blob = async (buffer: Uint8Array) => {
    const canvas = buffer_to_canvas(buffer);
    if (!canvas) return;

    return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob);
        }, "image/png");
    });
}

const BODY_THICKNESS = 0.04;
const SCREEN_OFFSET = BODY_THICKNESS / 2 + 0.001;

const UploadControls = ({ buffer, go_back }: { buffer: Uint8Array, go_back: () => void }) => {
    const hypergram = useHypergram();

    const texture = useMemo(() => {
        const tex = new DataTexture(
            buffer,
            HIGH_RES_WIDTH,
            HIGH_RES_HEIGHT,
            RGBAFormat
        );
        tex.colorSpace = SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
    }, [buffer]);

    const [posting, setPosting] = useState(false);
    const [post_success, setPostSuccess] = useState<boolean | null>(null);

    const post_to_hypergram = useCallback(
        async () => {
            if (!hypergram.active) {
                console.error("Hypergram not active, cannot post photo");
                return;
            }

            setPosting(true);
            setPostSuccess(null);

            const blob = await image_buffer_to_blob(buffer);
            if (!blob) {
                console.error("Failed to convert buffer to blob");
                setPosting(false);
                return;
            }

            // TODO: caption input (probably new screen)
            const success = await hypergram.post_photo!(new File([blob], "upload.png"), "Captured with HyperlinkVR");
            if (success) {
                console.log("Photo uploaded to Hypergram successfully!");
                setPostSuccess(true);
            } else {
                console.error("Failed to upload photo to Hypergram");
                setPostSuccess(false);
            }

            setPosting(false);
        },
        [buffer, hypergram]
    );

    return (
        <group position={[0, 0, SCREEN_OFFSET]}>
            <Container
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap={1}
                width={40}
            >
                <Button
                    onPointerDown={go_back}
                    backgroundColor="black"
                    height={3}
                    width={3}
                    flexGrow={1}
                    flexShrink={1}
                    flexBasis={0}
                    paddingX={0.5}
                    paddingY={0.5}
                    justifyContent="center"
                    alignItems="center"
                >
                    <Text fontSize={2} color="white">
                        X
                    </Text>
                </Button>

                <Image src={texture} width={40} keepAspectRatio borderRadius={1} />

                <Container
                    width={40}
                    flexDirection="row"
                    gap={1}
                    justifyContent="space-between"
                >
                    <Button
                        onPointerDown={() => download_image_buffer(buffer)}
                        backgroundColor="black"
                        height={4}
                        flexGrow={1}
                        flexShrink={1}
                        flexBasis={0}
                        paddingX={0.5}
                        paddingY={0.5}
                        justifyContent="center"
                        alignItems="center"
                    >
                        <Text fontSize={2} color="white">
                            Save to device
                        </Text>
                    </Button>

                    {hypergram.active && (
                        <Button
                            onPointerDown={post_to_hypergram}
                            backgroundColor="black"
                            height={4}
                            flexGrow={1}
                            flexShrink={1}
                            flexBasis={0}
                            paddingX={0.5}
                            paddingY={0.5}
                            justifyContent="center"
                            alignItems="center"
                            disabled={posting || post_success === true}
                        >
                            <Text fontSize={2} color="white">
                                {posting ? "Posting..." : (post_success === true ? "Posted!" : "Post to Hypergram")}
                            </Text>
                        </Button>
                    )}
                </Container>
            </Container>
        </group>
    );
};

const CaptureControls = ({ buffer_ref, on_capture, capture_pending }: { buffer_ref: RefObject<Uint8Array | null>, on_capture?: () => void, capture_pending: RefObject<boolean> }) => {
    const camera_ref = useRef<PerspectiveCameraType>(null);

    const on_camera_ready = useCallback(
        (cam: PerspectiveCameraType) => {
            if (!cam) return;

            camera_ref.current = cam;
            cam.layers.mask = LAYER_MASK;
        },
        []
    );

    const screen_mesh_ref = useRef<Mesh>(null);

    const { gl, scene } = useThree();

    // low res preview renderered every frame for the viewfinder
    const preview_rt = useFBO(LOW_RES_WIDTH, LOW_RES_HEIGHT, {
        minFilter: LinearFilter,
        magFilter: LinearFilter
    });

    // high res render for snapshot, only rendered when user clicks the capture button
    const capture_rt = useFBO(HIGH_RES_WIDTH, HIGH_RES_HEIGHT, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        format: RGBAFormat,
        type: UnsignedByteType,
        colorSpace: SRGBColorSpace
    });

    useFrame(() => {
        if (!camera_ref.current) return;

        // hide screen mesh so it doesn't appear in the render target
        // TODO: use a layer for this so later camera body also excluded (or just apply the ref to the camera body too)
        if (screen_mesh_ref.current) screen_mesh_ref.current.visible = false;

        const prev_xr_enabled = gl.xr.enabled;
        const prev_target = gl.getRenderTarget();
        const prev_effects = active_pipeline.passes;
        gl.xr.enabled = false;
        gl.setEffects([]);

        // low res preview render every frame for the viewfinder
        gl.setRenderTarget(preview_rt);
        gl.render(scene, camera_ref.current);

        // high res render for snapshot, only rendered when user clicks the capture button
        if (capture_pending.current) {
            capture_pending.current = false;

            gl.setRenderTarget(capture_rt);
            gl.render(scene, camera_ref.current);

            // read pixels into buffer
            const buffer = new Uint8Array(HIGH_RES_WIDTH * HIGH_RES_HEIGHT * 4);
            gl.readRenderTargetPixels(
                capture_rt,
                0,
                0,
                HIGH_RES_WIDTH,
                HIGH_RES_HEIGHT,
                buffer
            );

            buffer_ref.current = buffer;
            on_capture?.();
        }

        gl.setRenderTarget(prev_target);
        gl.setEffects(prev_effects);
        gl.xr.enabled = prev_xr_enabled;

        // show screen mesh again
        if (screen_mesh_ref.current) screen_mesh_ref.current.visible = true;
    });

    return (
        <group>
            <PerspectiveCamera
                ref={on_camera_ready}
                fov={60}
                aspect={DISPLAY_ASPECT}
                near={0.1}
                far={100}
            />

            <mesh ref={screen_mesh_ref} position={[0, 0, SCREEN_OFFSET]}>
                <planeGeometry args={[0.15, 0.15 / DISPLAY_ASPECT]} />
                <meshBasicMaterial map={preview_rt.texture} />
            </mesh>

            <mesh position={[0, -0.055, SCREEN_OFFSET]} rotation={[Math.PI / 2, 0, 0]} onPointerDown={() => (capture_pending.current = true)}>
                <cylinderGeometry args={[0.01, 0.01, 0.001, 32]} />
                <meshStandardMaterial color="white" />
            </mesh>
        </group>
    );
};

const CameraControls = ({capture_pending}: {capture_pending: RefObject<boolean>}) => {
    const captured_buffer = useRef<Uint8Array | null>(null);
    const [has_captured, setHasCaptured] = useState(false);

    if (!has_captured) {
        return (
            <CaptureControls
                capture_pending={capture_pending}
                buffer_ref={captured_buffer}
                on_capture={() => setHasCaptured(true)}
            />
        );
    } else {
        if (!captured_buffer.current) {
            console.error("Captured buffer is null after capture!");
            return null;
        }

        return (
            <UploadControls
                buffer={captured_buffer.current}
                go_back={() => setHasCaptured(false)}
            />
        );
    }
}

export const PhotoCamera = () => {
    const capture_pending = useRef(false);

    // TODO: properly modelled camera, this is a prototype
    return (
        <Grabbable sticky position={[0, 2, 0]} on_trigger_start={() => (capture_pending.current = true)}>
            <group position={[0, -0.015, 0]}>
                <mesh>
                    <boxGeometry args={[0.175, 0.125, BODY_THICKNESS]} />
                    <meshStandardMaterial color="gray" />
                </mesh>

                <mesh position={[0, 0, -SCREEN_OFFSET - 0.02]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.04, 0.04, 0.04, 32]} />
                    <meshStandardMaterial color="gray" />
                </mesh>
            </group>

            <HypergramProvider>
                <CameraControls capture_pending={capture_pending} />
            </HypergramProvider>
        </Grabbable>
    );
}

// TODO: gadget equipping (holster or hand menu?)
// TODO: square guide, or just stop making them square online
