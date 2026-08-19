import { useSetting } from "@hyperlinkvr/react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
    BoxHelper,
    CanvasTexture,
    Color,
    DirectionalLight, DirectionalLightHelper,
    Group,
    PointLight,
    PointLightHelper,
    SpotLight, SpotLightHelper,
    Sprite,
    SpriteMaterial,
    Vector3
} from "three";

import { SceneRerenderScanner } from "./SceneRerenderScanner";


type Light = PointLight | SpotLight | DirectionalLight;
type LightHelper = PointLightHelper | SpotLightHelper | DirectionalLightHelper;
const LightHelpers = () => {
    const scene = useThree((s) => s.scene);

    const helpers = useRef(new Map<Light, LightHelper>());

    useFrame(() => {
        const seen = new Set<PointLight | SpotLight | DirectionalLight>();

        scene.traverse((obj) => {
            if ((obj as PointLight).isPointLight) {
                const light = obj as PointLight;
                seen.add(light);
                let helper = helpers.current.get(light);
                if (!helper) {
                    helper = new PointLightHelper(light, 0.25, 0xffff00);
                    scene.add(helper);
                    helpers.current.set(light, helper);
                }
                helper.update();
            } else if ((obj as SpotLight).isSpotLight) {
                const light = obj as SpotLight;
                seen.add(light);
                let helper = helpers.current.get(light);
                if (!helper) {
                    helper = new SpotLightHelper(light, 0xffff00);
                    scene.add(helper);
                    helpers.current.set(light, helper);
                }
                helper.update();
            } else if ((obj as DirectionalLight).isDirectionalLight) {
                const light = obj as DirectionalLight;
                seen.add(light);
                let helper = helpers.current.get(light);
                if (!helper) {
                    helper = new DirectionalLightHelper(light, 0.25, 0xffff00);
                    scene.add(helper);
                    helpers.current.set(light, helper);
                }
                helper.update();
            }
        });

        // remove helpers for lights that vanished
        for (const [light, helper] of helpers.current) {
            if (!seen.has(light)) {
                scene.remove(helper);
                helper.dispose();
                helpers.current.delete(light);
            }
        }
    });

    useEffect(() => {
        const map = helpers.current;
        return () => {
            for (const [, helper] of map) {
                helper.parent?.remove(helper);
                helper.dispose();
            }
            map.clear();
        };
    }, []);

    return null;
};


const LABEL_SCALE = 0.00025;
const LABEL_OPACITY = 0.4;
const EMPTY_LABEL_OPACITY = 0.025;
const make_label = (text?: string, subtext?: string): Sprite => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const font_size_text = 48;
    const font_size_subtext = 32;
    const padding = 16;

    const text_was_empty = !text || text.trim() === "";
    text = text || "(unnamed)";

    // measure text
    ctx.font = `${font_size_text}px sans-serif`;
    const text_width = ctx.measureText(text).width;

    // measure subtext if provided
    let subtext_width = 0;
    if (subtext) {
        ctx.font = `${font_size_subtext}px sans-serif`;
        subtext_width = ctx.measureText(subtext).width;
    }

    canvas.width = Math.max(text_width, subtext_width) + padding * 2;
    canvas.height = font_size_text + (subtext ? font_size_subtext : 0) + padding * 2;

    ctx.fillStyle = `rgba(0, 0, 0, ${text_was_empty ? EMPTY_LABEL_OPACITY : LABEL_OPACITY})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // re-apply after resize (resizing clears the context)
    ctx.font = `${font_size_text}px sans-serif`;
    ctx.textBaseline = "middle";

    // draw main text
    ctx.fillStyle = text_was_empty ? "#aaaaaa" : "#00ffff";
    ctx.fillText(text, padding, padding + font_size_text / 2);

    // draw subtext if provided
    if (subtext) {
        ctx.font = `${font_size_subtext}px sans-serif`;
        ctx.fillStyle = "#aaaaaa";
        ctx.fillText(subtext, padding, padding + font_size_text + font_size_subtext / 2);
    }

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({
        map: texture,
        depthTest: false, // draw on top so it's readable through geometry
        transparent: true
    });

    const sprite = new Sprite(material);
    sprite.scale.set(canvas.width * LABEL_SCALE, canvas.height * LABEL_SCALE, 1);
    sprite.renderOrder = 999;
    return sprite;
};

type GroupDebug = { box: BoxHelper | null; label: Sprite };

const GroupHelpers = () => {
    const scene = useThree((s) => s.scene);
    const helpers = useRef(new Map<Group, GroupDebug>());
    const world_pos = useRef(new Vector3());

    useFrame(() => {
        const seen = new Set<Group>();

        scene.traverse((obj) => {
            if ((obj as Group).isGroup && !(obj as any).__debugHelper) {
                const group = obj as Group;
                seen.add(group);

                let entry = helpers.current.get(group);
                if (!entry) {
                    try {
                        const box = new BoxHelper(group, new Color(0x00ffff));
                        (box as any).__debugHelper = true;

                        const label = make_label(group.name, JSON.stringify(group.userData));
                        (label as any).__debugHelper = true;

                        scene.add(box);
                        scene.add(label);
                        entry = { box, label };
                        helpers.current.set(group, entry);
                    } catch (e) {
                        console.error("Failed to create debug helper for group", group, e);

                        // fallback to just a label
                        const label = make_label(group.name ? `${group.name} (no box)` : "(unnamed) (no box)", JSON.stringify(group.userData));
                        (label as any).__debugHelper = true;
                        scene.add(label);
                        entry = { box: null, label };
                        helpers.current.set(group, entry);
                    }
                }

                if (!entry) return;

                if (entry.box) {
                    entry.box.update();
                }

                // park the label at the group's world position
                group.getWorldPosition(world_pos.current);
                entry.label.position.copy(world_pos.current);
            }
        });

        for (const [group, entry] of helpers.current) {
            if (!seen.has(group)) {
                if (entry.box) {
                    scene.remove(entry.box);
                    entry.box.dispose();
                }

                scene.remove(entry.label);
                entry.label.material.map?.dispose();
                entry.label.material.dispose();
                helpers.current.delete(group);
            }
        }
    });

    useEffect(() => {
        const map = helpers.current;
        return () => {
            for (const [, entry] of map) {
                if (entry.box) {
                    entry.box.parent?.remove(entry.box);
                    entry.box.dispose();
                }

                entry.label.parent?.remove(entry.label);
                entry.label.material.map?.dispose();
                entry.label.material.dispose();
            }
            map.clear();
        };
    }, []);

    return null;
};

export const SceneDebug = () => {
    const [show_lights] = useSetting("debug_lights");
    const [show_groups] = useSetting("debug_groups");

    return (
        <>
            {show_lights && <LightHelpers />}
            {show_groups && <GroupHelpers />}
            <SceneRerenderScanner />
        </>
    );
};
