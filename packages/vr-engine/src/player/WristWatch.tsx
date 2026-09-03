import { useSetting } from "@hyperlinkvr/react";
import { WATCH_UI_HEIGHT, WATCH_UI_WIDTH, WatchUI } from "@hyperlinkvr/watch-ui";
import { useFrame, useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Group, Object3D } from "three";
import { MathUtils, Matrix4, Quaternion, Raycaster, Vector2, Vector3 } from "three";



import { useSessionMode } from "../../../react/src/contexts/SessionMode";
import { useHands } from "../input/hands";
import { FlatWatchUINavDriver, useFlatInputControls, useFlatInputState } from "../input/impl/flat/bindings";
import { click_raycast_layer_mask, Layer, LayerGroup } from "../render";

export type WatchMode = "wrist" | "presented" | "detached";

const OPEN_THRESHOLD = 0.85; // harder to open
const CLOSE_THRESHOLD = 0.7; // easier to keep open

const FORWARD = new Vector3(0, 0, -1);
const WORLD_UP = new Vector3(0, 1, 0);
const FLIP_180 = new Quaternion().setFromAxisAngle(WORLD_UP, Math.PI);

const build_wrist_offset = (hand: "left" | "right") => {
    const rotate_x = new Matrix4().makeRotationX(-Math.PI / 3);
    const rotate_z = new Matrix4().makeRotationZ(hand === "left" ? Math.PI / 2 : -Math.PI / 2);
    const translate = new Matrix4().makeTranslation(
        hand === "left" ? 0.02 : -0.02,
        0.055,
        -0.01
    );
    return new Matrix4()
        .multiply(rotate_x)
        .multiply(rotate_z)
        .multiply(translate);
};

interface WatchUIPresentationProps {
    mode: WatchMode;
    gaze_to_open?: boolean;
    on_request_close?: () => void;
    set_detach?: (detached: boolean) => void;
    detachable?: boolean;
}

const WatchUIPresentation = ({
    mode,
    gaze_to_open = false,
    on_request_close,
    set_detach,
    detachable = false
}: WatchUIPresentationProps) => {
    const body_group_ref = useRef<Group>(null);
    const ui_group_ref = useRef<Group>(null);

    const [watch_hand] = useSetting("watch_hand");
    const hands = useHands();
    const { camera } = useThree();

    const [ui_open, setUIOpen] = useState(false);
    const wrist_offset = useMemo(
        () => build_wrist_offset(watch_hand),
        [watch_hand]
    );

    const scratch = useMemo(
        () => ({
            wrist_world: new Matrix4(),
            wrist_local: new Matrix4(),
            ui_world: new Matrix4(),
            ui_local: new Matrix4(),
            parent_inverse: new Matrix4(),
            wrist_pos: new Vector3(),
            wrist_quat: new Quaternion(),
            wrist_scale: new Vector3(1, 1, 1),
            ui_pos: new Vector3(),
            ui_quat: new Quaternion(),
            ui_scale: new Vector3(1, 1, 1),
            camera_pos: new Vector3(),
            body_pos: new Vector3(),
            body_quat: new Quaternion(),
            body_up: new Vector3(),
            dir_to_camera: new Vector3(),
            look_matrix: new Matrix4(),
            detached_pos: new Vector3(),
            detached_quat: new Quaternion(),
            detached_scale: 1.6
        }),
        []
    );

    const previous_mode = useRef<WatchMode>("wrist");

    useFrame((_, delta) => {
        const body_group = body_group_ref.current;
        const ui_group = ui_group_ref.current;
        if (!body_group || !ui_group) return;

        // prefer the configured watch hand, but fall back to any hand whose grip tracks
        const preferred = hands.find((hand) => hand.handedness === watch_hand && hand.grip.current);
        const fallback = hands.find((hand) => hand.grip.current);
        const grip_node = (preferred ?? fallback)?.grip.current ?? null;

        let have_wrist = false;
        if (grip_node) {
            grip_node.updateWorldMatrix(true, false);
            scratch.wrist_world.multiplyMatrices(grip_node.matrixWorld, wrist_offset);
            scratch.wrist_world.decompose(
                scratch.wrist_pos,
                scratch.wrist_quat,
                scratch.wrist_scale
            );
            scratch.wrist_scale.setScalar(1);
            have_wrist = true;
        }

        if (have_wrist) {
            scratch.wrist_world.compose(
                scratch.wrist_pos,
                scratch.wrist_quat,
                scratch.wrist_scale
            );
            if (body_group.parent) {
                body_group.parent.updateWorldMatrix(true, false);
                scratch.parent_inverse.copy(body_group.parent.matrixWorld).invert();
                scratch.wrist_local.multiplyMatrices(
                    scratch.parent_inverse,
                    scratch.wrist_world
                );
            } else {
                scratch.wrist_local.copy(scratch.wrist_world);
            }
            scratch.wrist_local.decompose(
                body_group.position,
                body_group.quaternion,
                body_group.scale
            );
        }

        let have_ui_target = false;

        // positioning of ui panel based on mode
        if (mode === "wrist") {
            // panel sits on the watch body, so reuse the wrist transform
            if (have_wrist) {
                scratch.ui_pos.copy(scratch.wrist_pos);
                scratch.ui_quat.copy(scratch.wrist_quat);
                scratch.ui_scale.setScalar(1);
                have_ui_target = true;
            }
        } else if (mode === "presented") {
            camera.getWorldPosition(scratch.ui_pos);
            camera.getWorldQuaternion(scratch.ui_quat);
            scratch.ui_pos.add(
                FORWARD.clone().applyQuaternion(scratch.ui_quat).multiplyScalar(0.55)
            );
            scratch.look_matrix.lookAt(
                scratch.ui_pos,
                camera.getWorldPosition(scratch.camera_pos),
                WORLD_UP
            );
            scratch.ui_quat.setFromRotationMatrix(scratch.look_matrix);
            scratch.ui_quat.multiply(FLIP_180);
            scratch.ui_scale.setScalar(2.2);
            have_ui_target = true;
        } else if (mode === "detached") {
            if (previous_mode.current !== "detached") {
                // spawn where the panel currently is, but re-orient to face the user
                ui_group.getWorldPosition(scratch.detached_pos);
                camera.getWorldPosition(scratch.camera_pos);

                scratch.look_matrix.lookAt(
                    scratch.detached_pos,
                    scratch.camera_pos,
                    WORLD_UP
                );
                scratch.detached_quat.setFromRotationMatrix(scratch.look_matrix);
                scratch.detached_quat.multiply(FLIP_180);
            }
            scratch.ui_pos.copy(scratch.detached_pos);
            scratch.ui_quat.copy(scratch.detached_quat);
            scratch.ui_scale.setScalar(scratch.detached_scale);
            have_ui_target = true;
        }

        previous_mode.current = mode;

        if (have_ui_target) {
            scratch.ui_world.compose(scratch.ui_pos, scratch.ui_quat, scratch.ui_scale);
            if (ui_group.parent) {
                ui_group.parent.updateWorldMatrix(true, false);
                scratch.parent_inverse.copy(ui_group.parent.matrixWorld).invert();
                scratch.ui_local.multiplyMatrices(scratch.parent_inverse, scratch.ui_world);
            } else {
                scratch.ui_local.copy(scratch.ui_world);
            }
            scratch.ui_local.decompose(
                ui_group.position,
                ui_group.quaternion,
                ui_group.scale
            );
        }

        let want_open: boolean;
        if (mode !== "wrist") {
            want_open = true; // presented / detached: always open
        } else if (gaze_to_open) {
            camera.getWorldPosition(scratch.camera_pos);
            body_group.getWorldPosition(scratch.body_pos);
            body_group.getWorldQuaternion(scratch.body_quat);
            scratch.dir_to_camera
                .subVectors(scratch.camera_pos, scratch.body_pos)
                .normalize();
            scratch.body_up.set(0, 1, 0).applyQuaternion(scratch.body_quat);

            const facing_dot = scratch.dir_to_camera.dot(scratch.body_up);
            const distance_to_camera = scratch.camera_pos.distanceTo(scratch.body_pos);

            if (distance_to_camera < 0.6) {
                if (facing_dot > OPEN_THRESHOLD) want_open = true;
                else if (facing_dot < CLOSE_THRESHOLD) want_open = false;
                else want_open = ui_open;
            } else {
                want_open = false;
            }
        } else {
            // flat wrist with no gaze gesture: body visible, panel closed until presented
            want_open = false;
        }

        if (want_open !== ui_open) {
            setUIOpen(want_open);
        }

        const ui_container = ui_group.children[0];
        if (ui_container) {
            if (mode === "wrist") {
                ui_container.position.set(0, 0.05, -0.05);
                ui_container.rotation.set(
                    -Math.PI / 2,
                    0,
                    watch_hand === "left" ? Math.PI / 2 : -Math.PI / 2
                );
            } else {
                ui_container.position.set(0, 0, 0.001);
                ui_container.rotation.set(0, 0, 0);
            }
        }

        const MIN_UI_SCALE = 0.001;
        const SNAP_EPSILON = 0.002;

        const open_scale = ui_open ? 1 : 0;
        ui_group.scale.multiplyScalar(1); // keep world scale from step 2
        if (ui_container) {
            let next_scale = MathUtils.lerp(ui_container.scale.x, open_scale, 1 - Math.exp(-12 * delta));
            if (Math.abs(next_scale - open_scale) < SNAP_EPSILON) {
                next_scale = open_scale; // settle instead of decaying forever
            }
            next_scale = Math.max(next_scale, MIN_UI_SCALE);
            ui_container.scale.setScalar(next_scale);
            ui_container.visible = next_scale > MIN_UI_SCALE;
        }
    });

    return (
        <>
            <group ref={body_group_ref}>
                <mesh>
                    <boxGeometry args={[0.05, 0.01, 0.06]} />
                    <meshStandardMaterial color="#222222" />
                </mesh>
            </group>

            <group ref={ui_group_ref}>
                <LayerGroup name="WatchUI" layers={[Layer.NoVFX]} dynamic>
                    <Container
                        width={WATCH_UI_WIDTH}
                        height={WATCH_UI_HEIGHT}
                        pixelSize={0.3 / WATCH_UI_HEIGHT}
                        flexDirection="column"
                    >
                        <Suspense fallback={null}> {/* TODO: little backup loading panel */}
                            <WatchUI on_request_close={on_request_close} detached={mode === "detached"} set_detach={set_detach} detachable={detachable} />
                        </Suspense>
                    </Container>
                </LayerGroup>
            </group>
        </>
    );
};

// on flat, clicking outside the watch closes it automatically
const FlatWatchClickOutside = ({ on_close }: { on_close: () => void }) => {
    const { gl, camera, scene } = useThree();

    useEffect(() => {
        const canvas = gl.domElement;
        const raycaster = new Raycaster();
        raycaster.layers.mask = click_raycast_layer_mask;

        const ndc = new Vector2();

        const is_watch = (object: Object3D): boolean => {
            let node: Object3D | null = object;
            while (node) {
                if (node.name === "WatchUI") return true;
                node = node.parent;
            }
            return false;
        };

        const on_down = (event: PointerEvent) => {
            if (event.button !== 0) return;
            if (document.pointerLockElement === canvas) return; // only when the cursor is free

            const rect = canvas.getBoundingClientRect();
            ndc.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(ndc, camera);

            // intersections are sorted nearest first so the first visible hit decides
            for (const hit of raycaster.intersectObjects(scene.children, true)) {
                if (!hit.object.visible) continue;
                if (is_watch(hit.object)) return; // clicked the watch, keep it open
                break; // clicked something else in front of the watch
            }

            on_close();
        };

        canvas.addEventListener("pointerdown", on_down);
        return () => canvas.removeEventListener("pointerdown", on_down);
    }, [gl, camera, scene, on_close]);

    return null;
};

export const FlatWatch = () => {
    const input = useFlatInputState();
    const { close_watch } = useFlatInputControls();

    return (
        <>
            <WatchUIPresentation
                mode={input.watch_presented ? "presented" : "wrist"}
                gaze_to_open={false}
                on_request_close={close_watch}
            />
            <FlatWatchUINavDriver />
            {input.watch_presented && <FlatWatchClickOutside on_close={close_watch} />}
        </>
    );
};

export const VRWatch = () => {
    const [detached, setDetached] = useState(false);
    // TODO: add controller bind for detach
    return <WatchUIPresentation mode={detached ? "detached" : "wrist"} detachable set_detach={setDetached} gaze_to_open />;
};

export const WristWatch = () => {
    const session_mode = useSessionMode();
    return session_mode === "vr" ? <VRWatch /> : <FlatWatch />;
};

// TODO: wrist gesture far from detached watch should reattach. or just auto reattach at distance anyway. perhaps both at diff distances
