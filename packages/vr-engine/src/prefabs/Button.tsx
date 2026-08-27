import type { ButtonPrefab } from "@hyperlinkvr/vr-engine-schemas";
import { RoundedBoxGeometry, Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ExtrudeGeometry, MathUtils, Shape, Vector3, type Group, type Object3D, type WebXRManager } from "three";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils";



import { ObjectPhysics } from "../engine/ObjectPhysics";
import { useObjectBinding } from "../hooks/useObjectBinding";
import { Grabbable } from "../interaction";
import type { PrefabProps } from "../types";
import { PrefabRoot } from "./PrefabRoot";


const WIDTH = 0.55;
const HEIGHT = 0.55;
const CORNER_RADIUS = 0.05;
const DEPTH = 0.1;

/** Plunger rest offset from the housing origin, along +Z. */
const REST_Z = 0.1;
/** How far the plunger can sink into the housing. */
const MAX_TRAVEL = 0.04;

/** Effective radius of a fingertip, so the button reacts to skin not to a point. */
const POKE_RADIUS = 0.012;
/** Lateral slop allowed outside the footprint before a poke stops counting. */
const LATERAL_MARGIN = 0.01;

/** Depth at which the button actuates, and the shallower depth at which it resets. */
const PRESS_THRESHOLD = MAX_TRAVEL * 0.6;
const RELEASE_THRESHOLD = MAX_TRAVEL * 0.35;

/** Ignore anything this far past full travel — it came through the back, not the front. */
const PASS_THROUGH_SLOP = 0.06;

const POKE_JOINT_NAMES = ["index-finger-tip", "thumb-tip"];

/** Troika/drei Text sits in front of the plunger face; stop it eating pointer hits. */
const ignoreRaycast = () => null;

const gatherPokeSources = (xrManager: WebXRManager, target: Object3D[]) => {
    target.length = 0;

    for (let handIndex = 0; handIndex < 2; handIndex++) {
        const hand = xrManager.getHand(handIndex) as Object3D & {
            joints?: Record<string, Object3D>;
        };

        if (hand?.joints) {
            for (const jointName of POKE_JOINT_NAMES) {
                const joint = hand.joints[jointName];
                if (joint?.visible) {
                    target.push(joint);
                }
            }
        }

        const controllerGrip = xrManager.getControllerGrip(handIndex);
        if (controllerGrip?.visible) {
            target.push(controllerGrip);
        }
    }
};

type ButtonProps = PrefabProps<ButtonPrefab> & {
    on_press_override?: () => void;
    on_release_override?: () => void;
};

export const Button = (props: ButtonProps) => {
    const {emit_report} = useObjectBinding(props.binding);

    const geometry = useMemo(() => {
        // The front rounding comes from a positive outward bevel.
        const bevelThickness = DEPTH * 0.4;
        const bevelSize = bevelThickness;
        const coreDepth = DEPTH - bevelThickness;

        // Shrink the 2D shape so that after the outward bevel the final
        // silhouette is exactly WIDTH x HEIGHT with corner radius CORNER_RADIUS.
        const shapeWidth = WIDTH - bevelSize * 2;
        const shapeHeight = HEIGHT - bevelSize * 2;
        const shapeRadius = Math.max(0.001, CORNER_RADIUS - bevelSize);

        const shape = new Shape();
        const left = -shapeWidth / 2;
        const bottom = -shapeHeight / 2;
        const right = shapeWidth / 2;
        const top = shapeHeight / 2;
        const cornerR = shapeRadius;

        shape.moveTo(left, bottom + cornerR);
        shape.lineTo(left, top - cornerR);
        shape.absarc(left + cornerR, top - cornerR, cornerR, Math.PI, Math.PI / 2, true);
        shape.lineTo(right - cornerR, top);
        shape.absarc(right - cornerR, top - cornerR, cornerR, Math.PI / 2, 0, true);
        shape.lineTo(right, bottom + cornerR);
        shape.absarc(right - cornerR, bottom + cornerR, cornerR, 0, -Math.PI / 2, true);
        shape.lineTo(left + cornerR, bottom);
        shape.absarc(left + cornerR, bottom + cornerR, cornerR, -Math.PI / 2, Math.PI, true);

        const extrudeSettings = {
            depth: coreDepth,
            steps: 1,
            bevelEnabled: true,
            bevelThickness: bevelThickness,
            bevelSize: bevelSize,
            bevelSegments: 6,
            curveSegments: 16,
        };

        const geo = new ExtrudeGeometry(shape, extrudeSettings);

        // ExtrudeGeometry bevels both ends: the back bevel occupies z < 0.
        // Flatten it so the back is a flush squircle face.
        const positions = geo.attributes.position;
        if (!positions) throw new Error("ExtrudeGeometry has no position attribute");
        for (let index = 0; index < positions.count; index++) {
            if (positions.getZ(index) < 0) {
                positions.setZ(index, 0);
            }
        }

        const welded = mergeVertices(geo, 1e-4);
        const shaded = toCreasedNormals(welded, (50 * Math.PI) / 180);
        shaded.center();

        return shaded;
    }, []);

    const housingRef = useRef<Group>(null);
    const plungerRef = useRef<Group>(null);

    const travelRef = useRef(0);
    const isActuatedRef = useRef(false);
    const isRayHeldRef = useRef(false);

    /**
     * A poke source may only press the button if it first approached from the front.
     * Without this, a hand sweeping through the wall behind the panel would trigger it.
     */
    const armedSourcesRef = useRef(new Map<Object3D, boolean>());
    const pokeSourcesRef = useRef<Object3D[]>([]);
    const worldPointRef = useRef(new Vector3());
    const localPointRef = useRef(new Vector3());

    const handleRayDown = useCallback((event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        isRayHeldRef.current = true;
    }, []);

    // Release even if the pointer is dragged off the button before being let go.
    useEffect(() => {
        const releaseRay = () => {
            isRayHeldRef.current = false;
        };

        window.addEventListener("pointerup", releaseRay);
        window.addEventListener("pointercancel", releaseRay);

        return () => {
            window.removeEventListener("pointerup", releaseRay);
            window.removeEventListener("pointercancel", releaseRay);
        };
    }, []);

    const emit_press_report = useCallback(() => {
        if (props.report_press) {
            // assumes local player for now
            emit_report({
                kind: "button-prefab",
                payload: { type: "press", username: null }
            });
        }
    }, [emit_report, props.report_press]);

    const emit_release_report = useCallback(() => {
        if (props.report_release) {
            // assumes local player for now
            emit_report({
                kind: "button-prefab",
                payload: { type: "release", username: null }
            });
        }
    }, [emit_report, props.report_release]);

    useFrame((state, delta) => {
        const housing = housingRef.current;
        const plunger = plungerRef.current;
        if (!housing || !plunger) return;

        const halfWidth = WIDTH / 2 + LATERAL_MARGIN;
        const halfHeight = HEIGHT / 2 + LATERAL_MARGIN;
        const frontSurfaceZ = REST_Z + DEPTH / 2;

        let pokeTravel = 0;
        let isPoked = false;

        const xrManager = state.gl.xr;
        if (xrManager.isPresenting) {
            gatherPokeSources(xrManager, pokeSourcesRef.current);
            const armedSources = armedSourcesRef.current;

            for (const source of pokeSourcesRef.current) {
                source.getWorldPosition(worldPointRef.current);
                const localPoint = localPointRef.current.copy(worldPointRef.current);
                housing.worldToLocal(localPoint);

                const isWithinFootprint =
                    Math.abs(localPoint.x) <= halfWidth && Math.abs(localPoint.y) <= halfHeight;

                // Depth past the resting front face, accounting for finger thickness.
                const penetration = frontSurfaceZ - (localPoint.z - POKE_RADIUS);

                if (!isWithinFootprint || penetration <= 0) {
                    // Outside or in front of the button: this source is cleared to press again.
                    armedSources.set(source, true);
                    continue;
                }

                if (penetration > MAX_TRAVEL + PASS_THROUGH_SLOP) {
                    armedSources.set(source, false);
                    continue;
                }

                if (armedSources.get(source) === false) continue;

                isPoked = true;
                pokeTravel = Math.max(pokeTravel, Math.min(penetration, MAX_TRAVEL));
            }
        }

        const rayTravel = isRayHeldRef.current ? MAX_TRAVEL : 0;

        if (isPoked) {
            // Follow the finger exactly — this is what sells the physicality.
            travelRef.current = Math.max(pokeTravel, rayTravel);
        } else {
            travelRef.current = MathUtils.damp(travelRef.current, rayTravel, 18, delta);
        }

        plunger.position.z = REST_Z - travelRef.current;

        if (!isActuatedRef.current && travelRef.current >= PRESS_THRESHOLD) {
            isActuatedRef.current = true;
            props.on_press_override ? props.on_press_override() : emit_press_report();
        } else if (isActuatedRef.current && travelRef.current <= RELEASE_THRESHOLD) {
            isActuatedRef.current = false;
            props.on_release_override ? props.on_release_override() : emit_release_report();
        }
    });

    const physics_config = useMemo(() => {
        if (props.fixed) {
            return {
                rigid_body: {
                    type: "fixed" as const,

                    collider: {
                        type: "auto" as const,
                        approximation: "trimesh" as const,
                    },

                    restitution: 0.4,
                    friction: 0.5,
                },
            };
        }

        return {
            rigid_body: {
                type: "dynamic" as const,

                collider: {
                    type: "auto" as const,
                    // Dynamic bodies need a convex shape; trimesh colliders don't
                    // reliably generate contacts when they're the moving body.
                    approximation: "hull" as const,
                },

                restitution: 0.4,
                friction: 0.5,
                mass: 0.5,
            },
        };
    }, [props.fixed]);

    const body = (
        <group ref={housingRef}>
            <mesh position={[0, 0, 0]} scale={[0.66, 0.66, 0.1]} castShadow>
                <RoundedBoxGeometry />
                <meshStandardMaterial color="#aaaaaa" />
            </mesh>

            <group
                ref={plungerRef}
                position={[0, 0, REST_Z]}
                onPointerDown={handleRayDown}>
                <mesh geometry={geometry} castShadow>
                    <meshStandardMaterial color={props.body_color} />
                </mesh>
                <Text
                    position={[0, 0, 0.055]}
                    fontSize={0.1}
                    color={props.label_color}
                    anchorX="center"
                    anchorY="middle"
                    raycast={ignoreRaycast}
                >
                    {props.label}
                </Text>
            </group>
        </group>
    );

    return (
        <PrefabRoot>
            <ObjectPhysics physics={physics_config}>
                {props.grabbable ? <Grabbable>{body}</Grabbable> : body}
            </ObjectPhysics>
        </PrefabRoot>
    );
};
