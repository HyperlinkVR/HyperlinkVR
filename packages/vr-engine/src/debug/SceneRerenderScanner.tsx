import { useSetting } from "@hyperlinkvr/react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Object3D } from "three";
import { Box3, Box3Helper, Color } from "three";

import {flashes, set_scanning} from "./scanner";

const FLASH_MS = 600;
const _box = new Box3();

const ramp_color = (count: number, target: Color) => {
    const t = Math.min(1, (count - 1) / 12); // saturate around a dozen renders
    target.setHSL((1 - t) * 0.78, 0.9, 0.55);
};

const SceneScanRunner = () => {
    const scene = useThree((s) => s.scene);

    // live overlays, keyed by the scanned object
    const helpers = new Map<Object3D, Box3Helper>();

    useFrame(() => {
        const now = performance.now();

        for (const [obj, entry] of flashes) {
            const age = now - entry.last;
            if (age > FLASH_MS || !obj.parent) {
                const h = helpers.get(obj);
                if (h) {
                    scene.remove(h);
                    h.geometry.dispose();
                    helpers.delete(obj);
                }
                flashes.delete(obj);
                continue;
            }

            let helper = helpers.get(obj);
            if (!helper) {
                try {
                    helper = new Box3Helper(_box.clone(), new Color());
                    (helper as any).__debugHelper = true;
                    (helper.material as any).depthTest = false;
                    (helper.material as any).transparent = true;
                    helper.renderOrder = 998;
                    scene.add(helper);
                    helpers.set(obj, helper);
                } catch (e) {
                    console.error("Failed to create debug helper for object", obj, e);
                    flashes.delete(obj);
                    // TODO: fallback to marker/sphere
                    continue;
                }
            }

            // refit the box to the object's current world bounds
            try {
                _box.setFromObject(obj);
                (helper as any).box.copy(_box);
            } catch (e) {
                console.error("Failed to compute bounding box for object", obj, e);
                flashes.delete(obj);
                if (helper) {
                    scene.remove(helper);
                    helper.geometry.dispose();
                    helpers.delete(obj);
                }
                continue;
            }
            // TODO: broken

            ramp_color(entry.count, (helper.material as any).color);
            (helper.material as any).opacity = 1 - age / FLASH_MS;
        }
    });

    useEffect(() => {
        return () => {
            for (const [, h] of helpers) {
                h.parent?.remove(h);
                h.geometry.dispose();
            }
            helpers.clear();
            flashes.clear();
        };
    }, []);

    return null;
};

export const SceneRerenderScanner = () => {
    const [enabled] = useSetting("debug_rerenders");

    useEffect(() => {
        set_scanning(enabled);
        return () => {
            set_scanning(false);
        };
    }, [enabled]);

    return enabled ? <SceneScanRunner /> : null;
};
