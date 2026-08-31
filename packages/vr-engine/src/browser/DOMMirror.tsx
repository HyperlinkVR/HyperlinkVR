import type { ThreeEvent, Vector3 } from "@react-three/fiber";
import { useMessageEngine, useWorldSession } from "@hyperlinkvr/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoTexture } from "three";





export const DOMMirror = ({
    position,
    height,
    before_click
}: {
    position: Vector3;
    height: number;
    before_click?: (
        e: ThreeEvent<PointerEvent>,
        click_x: number,
        click_y: number
    ) => boolean; // return false to veto the click
}) => {
    const messenger = useMessageEngine();

    const videoRef = useRef(document.createElement("video"));

    const session = useWorldSession();
    const tabDims = session.tab_dimensions || { width: 1, height: 1 };

    // State 2: The oversized square stream (the envelope)
    const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });

    const texture = useMemo(() => {
        const video = videoRef.current;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        // Leave matrixAutoUpdate as true so ThreeJS applies our repeat/offset changes
        return new VideoTexture(video);
    }, []);

    // --- THIS IS THE CORRECTED LETTERBOX MATH ---
    useEffect(() => {
        if (videoDims.width === 0 || videoDims.height === 0) return;

        const tab_w = tabDims.width;
        const tab_h = tabDims.height;
        const env_w = videoDims.width;
        const env_h = videoDims.height;

        const tabAspect = tab_w / tab_h;
        const envAspect = env_w / env_h;

        let repeat_x, repeat_y, offset_x, offset_y;

        if (tabAspect > envAspect) {
            // Tab is wider than the envelope.
            // Chrome matches the width, but adds padding to top/bottom.
            repeat_x = 1.0; // Use 100% of the envelope's width
            repeat_y = envAspect / tabAspect; // Only use a fraction of the height

            offset_x = 0;
            // Center it vertically.
            offset_y = (1 - repeat_y) / 2;

            /* NOTE: If it looks cut off at the bottom, Chrome anchored the tab
               to the TOP of the square instead of the center. If so, use this:
               offset_y = 1 - repeat_y;
            */
        } else {
            // Tab is taller than envelope.
            // Chrome matches the height, but adds padding to left/right.
            repeat_x = tabAspect / envAspect;
            repeat_y = 1.0;

            // Center it horizontally.
            offset_x = (1 - repeat_x) / 2;
            offset_y = 0;
        }

        texture.repeat.set(repeat_x, repeat_y);
        texture.offset.set(offset_x, offset_y);
        texture.needsUpdate = true;
    }, [tabDims, videoDims, texture]);

    const stream_ref = useRef<MediaStream | null>(null);

    useEffect(() => {
        const handle_message = async (message: any) => {
            if (message.type === "HVR_STREAM") {
                stream_ref.current = await navigator.mediaDevices.getUserMedia({
                    video: {
                        // @ts-expect-error this is special to chrome extension apis, not standard web
                        mandatory: {
                            chromeMediaSource: "tab",
                            chromeMediaSourceId: message.stream
                        }
                    }
                });

                const video = videoRef.current;
                video.srcObject = stream_ref.current;

                video.onloadedmetadata = () => {
                    video.play();
                    // Lock in the oversized envelope dimensions once it loads
                    setVideoDims({
                        width: video.videoWidth,
                        height: video.videoHeight
                    });
                };

                video.onresize = () => {
                    // in case chrome resizes the stream (throttling)
                    setVideoDims({
                        width: video.videoWidth,
                        height: video.videoHeight
                    });
                };
            }
        };

        const unlisten = messenger.listen(handle_message);
        messenger.send({ action: "HVR_START_STREAM", tab: session.id });
// TODO: chrome independent stream handling (abstraction)
        return () => {
            if (stream_ref.current) {
                stream_ref.current.getTracks().forEach((track) => track.stop());
            }

            unlisten();
        }
    }, [messenger, session.id]);

    // 3. Resize the physical plane to exactly match the tab's aspect ratio
    const planeWidth = (tabDims.width / tabDims.height) * height;

    const handle_click = useCallback(
        (e: ThreeEvent<PointerEvent>) => {
            if (!e.uv) {
                return;
            }

            // the uv is normalised hit point [0,1] [0,1] on the plane. need to convert to tab pixels

            const click_x = Math.round(e.uv.x * tabDims.width);
            const click_y = Math.round((1 - e.uv.y) * tabDims.height);

            if (before_click && !before_click(e, click_x, click_y)) {
                return;
            }

            messenger.send({
                action: "HVR_CLICK",
                tab: session.id,
                pos: {
                    x: click_x,
                    y: click_y,
                    button: 0
                    // TODO: support right click, middle click, drag scrolling
                    // TODO: support holding and dragging mouse (emit mouse move and send up and down sep)
                    // TODO: thumbstick scroll
                    // TODO: ripple at click pos
                }
            });
        },
        [tabDims, texture, messenger, session.id, before_click]
    );

    return (
        <mesh name="DOMMirror" position={position} onPointerDown={handle_click}>
            <planeGeometry args={[planeWidth, height]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
    );
};
