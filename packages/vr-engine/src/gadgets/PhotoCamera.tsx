import { useSessionMode } from "@hyperlinkvr/react";
import { PerspectiveCamera, PositionalAudio, useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Container, Image, Text } from "@react-three/uikit";
import { Button, Input } from "@react-three/uikit-default";
import { RefObject, useCallback, useMemo, useRef, useState } from "react";
import { DataTexture, LinearFilter, Mesh, PerspectiveCamera as PerspectiveCameraType, RGBAFormat, SRGBColorSpace, UnsignedByteType, type PositionalAudio as PositionalAudioType } from "three";



import { HypergramProvider, useHypergram } from "../contexts/HypergramContext";
import { Grabbable } from "../interaction";
import { compute_layer_mask, Layer } from "../render";
import { active_pipeline } from "../render/GraphicsPipeline";
import { ArrowLeft, X } from "@react-three/uikit-lucide";
import { MAX_CAPTION_LENGTH } from "@hyperlinkvr/hypergram-schemas/v1";


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

const camera_sfx = new URL("../../assets/gadgets/camera/camera.opus", import.meta.url).href;

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

const HypergramPostControls = ({ texture, buffer, go_back, on_success }: { texture: DataTexture, go_back: () => void, buffer: Uint8Array, on_success: () => void }) => {
    const hypergram = useHypergram();

    const [caption_input, setCaptionInput] = useState("");

    const [posting, setPosting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const post_to_hypergram = useCallback(async (caption: string) => {
        if (!hypergram.active) {
            console.error("Hypergram not active, cannot post photo");
            return;
        }

        setError(null);
        setPosting(true);

        const blob = await image_buffer_to_blob(buffer);
        if (!blob) {
            console.error("Failed to convert buffer to blob");
            setPosting(false);
            return;
        }

        const success = await hypergram.post_photo!(
            new File([blob], "upload.png"),
            caption.length > 0 ? caption : undefined
        );

        setPosting(false);

        if (success) {
            console.log("Photo uploaded to Hypergram successfully!");
            on_success();
        } else {
            console.error("Failed to upload post to Hypergram");
            setError("Failed to upload post! Please try again.");
        }
    }, [buffer, hypergram, on_success]);

    return (
        <group position={[0, 0, SCREEN_OFFSET]}>
            <Container
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap={1}
                width={40}
            >
                <Container width={40} flexDirection="row" justifyContent="center">
                    <Container marginRight="auto" width={9} height={3}>
                        <Button
                            onPointerDown={go_back}
                            backgroundColor="black"
                            height={3}
                            width={9}
                            flexGrow={1}
                            flexShrink={1}
                            flexBasis={0}
                            paddingX={0.5}
                            paddingY={0.5}
                            justifyContent="center"
                            alignItems="center"
                            fontSize={2}
                            color="white"
                        >
                            <ArrowLeft marginRight={1} width={1.5} />
                            <Text>
                                Back
                            </Text>
                        </Button>
                    </Container>

                    {error && (
                        <Text fontSize={1} color="red">
                            {error}
                        </Text>
                    )}
                </Container>

                <Image src={texture} width={40} keepAspectRatio borderRadius={1} />

                <Container width={40} height={5}>
                    <Input
                        value={caption_input}
                        onValueChange={(val) => {
                            if (val.length <= MAX_CAPTION_LENGTH) {
                                setCaptionInput(val);
                            }
                        }}
                        placeholder="Enter caption (optional)..."
                        width="100%"
                        height="100%"
                        fontSize={1.5}
                        paddingX={2}
                        paddingY={0.5}
                        borderWidth={0.2}
                    />
                </Container>

                <Button
                    onPointerDown={() => post_to_hypergram(caption_input)}
                    backgroundColor="black"
                    height={4}
                    width={40}
                    flexGrow={1}
                    flexShrink={1}
                    flexBasis={0}
                    paddingX={0.5}
                    paddingY={0.5}
                    justifyContent="center"
                    alignItems="center"
                    disabled={posting}
                >
                    <Text fontSize={2} color="white">
                        {posting ? "Posting..." : "Post"}
                    </Text>
                </Button>
            </Container>
        </group>
    );
}

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

    const [show_post_menu, setShowPostMenu] = useState(false);
    const [posted, setPosted] = useState<boolean>(false);

    if (show_post_menu) {
        return (
            <HypergramPostControls
                texture={texture}
                buffer={buffer}
                go_back={() => setShowPostMenu(false)}
                on_success={() => {
                    setPosted(true);
                    setShowPostMenu(false);
                }}
            />
        );
    }

    return (
        <group position={[0, 0, SCREEN_OFFSET]}>
            <Container
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap={1}
                width={40}
            >
                <Container marginLeft="auto" width={10} height={3}>
                    <Button
                        onPointerDown={go_back}
                        backgroundColor="black"
                        height={3}
                        width={10}
                        flexGrow={1}
                        flexShrink={1}
                        flexBasis={0}
                        paddingX={0.5}
                        paddingY={0.5}
                        justifyContent="center"
                        alignItems="center"
                        fontSize={2}
                        color="white"
                    >
                        <X marginRight={1} width={1.25} />
                        <Text>
                            Close
                        </Text>
                    </Button>
                </Container>

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
                            onPointerDown={() => setShowPostMenu(true)}
                            backgroundColor="black"
                            height={4}
                            flexGrow={1}
                            flexShrink={1}
                            flexBasis={0}
                            paddingX={0.5}
                            paddingY={0.5}
                            justifyContent="center"
                            alignItems="center"
                            disabled={posted === true}
                        >
                            <Text fontSize={2} color="white">
                                {posted === true ? "Posted!" : "Post to Hypergram"}
                            </Text>
                        </Button>
                    )}
                </Container>
            </Container>
        </group>
    );
};

const CaptureControls = ({
    buffer_ref,
    on_capture,
    capture_pending,
    can_capture = { current: true }
}: {
    buffer_ref: RefObject<Uint8Array | null>;
    on_capture?: () => void;
    capture_pending: RefObject<boolean>;
    can_capture?: RefObject<boolean>;
}) => {
    const camera_ref = useRef<PerspectiveCameraType>(null);

    const on_camera_ready = useCallback((cam: PerspectiveCameraType) => {
        if (!cam) return;

        camera_ref.current = cam;
        cam.layers.mask = LAYER_MASK;
    }, []);

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

    const blackout_preview = useRef(0);

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
        if (blackout_preview.current > 0) {
            blackout_preview.current--;
        } else {
            gl.render(scene, camera_ref.current);
        }

        // high res render for snapshot, only rendered when user clicks the capture button
        if (capture_pending.current) {
            capture_pending.current = false;

            // blackout preview rt for a few frames to simulate shutter
            blackout_preview.current = 5;
            gl.clear();

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

            <mesh
                position={[0, -0.055, SCREEN_OFFSET]}
                rotation={[Math.PI / 2, 0, 0]}
                onPointerDown={() => {
                    if (!can_capture.current) return;
                    capture_pending.current = true;
                }}>
                <cylinderGeometry args={[0.01, 0.01, 0.001, 32]} />
                <meshStandardMaterial color="white" />
            </mesh>
        </group>
    );
};

const SHUTTER_TIME = 300;

const CameraControls = ({capture_pending, on_capture, can_capture = {current: true}}: {capture_pending: RefObject<boolean>, on_capture?: () => void, can_capture?: RefObject<boolean>}) => {
    const captured_buffer = useRef<Uint8Array | null>(null);
    const [show_upload, setShowUpload] = useState(false);

    const handle_capture = useCallback(
        () => {
            // show upload controls after a short delay to allow the shutter effect to be seen
            setTimeout(() => {
                setShowUpload(true);
            }, SHUTTER_TIME);

            on_capture?.();
        },
        [on_capture]
    );

    if (!show_upload) {
        return (
            <CaptureControls
                can_capture={can_capture}
                capture_pending={capture_pending}
                buffer_ref={captured_buffer}
                on_capture={handle_capture}
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
                go_back={() => {
                    setShowUpload(false);
                }}
            />
        );
    }
}

export const PhotoCamera = () => {
    const capture_pending = useRef(false);
    const sfx_ref = useRef<PositionalAudioType>(null);

    const can_capture = useRef(true);

    const handle_capture = useCallback(
        () => {
            // lock out capture for a short time while waiting for the shutter effect to be seen (and for the control switch to happen)
            can_capture.current = false;
            setTimeout(() => {
                can_capture.current = true;
            }, SHUTTER_TIME * 2);

            const sfx = sfx_ref.current;
            if (!sfx) return;

            sfx.offset = 0;
            sfx.play();
        },
        []
    );

    const mode = useSessionMode();
    // TODO: why does rotation comfort depend on mode? probably controller orientation. might be good to normalise, or offer way to set both, esp in sdk

    // TODO: properly modelled camera, this is a prototype
    return (
        <Grabbable
            sticky
            position={[0, 2, 0]}
            on_trigger_start={() => {
                if (!can_capture.current) return;
                capture_pending.current = true;
            }}
            grab_rotation={[mode === "vr" ? -Math.PI / 2 : 0, 0, 0]}
        >
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

            <PositionalAudio ref={sfx_ref} url={camera_sfx} distance={1} loop={false} autoplay={false} />

            <HypergramProvider>
                <CameraControls can_capture={can_capture} capture_pending={capture_pending} on_capture={handle_capture} />
            </HypergramProvider>
        </Grabbable>
    );
}

// TODO: gadget equipping (holster or hand menu?)
// TODO: square guide, or just stop making them square online
// TODO: controller haptics (abstracted in input providers, and used in multiple places)
// TODO: vr keyboard now also needed here (as well as it is for settings, watch search, dom mirror etc, automatic if possible would be super useful)
// TODO: lock flat input whilst focused on input fields
