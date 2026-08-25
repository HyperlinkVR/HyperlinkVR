import { Material, RepeatWrapping, Texture } from "three";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";

const SCROLLABLE_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"] as const;

type ScrollTarget = {
    texture: Texture;
    speed_u: number;
    speed_v: number;
};

export const useMaterialScroller = (materials: Record<string, Material> | undefined) => {
    const targets = useMemo<ScrollTarget[]>(() => {
        if (!materials) return [];

        const out: ScrollTarget[] = [];
        const seen = new Set<Texture>();

        Object.values(materials).forEach((material) => {
            const user_data = material.userData || {};

            const speed_u = typeof user_data.scroll_speed_u === "number" ? user_data.scroll_speed_u : 0;
            const speed_v = typeof user_data.scroll_speed_v === "number" ? user_data.scroll_speed_v : 0;
            if (speed_u === 0 && speed_v === 0) return;

            for (const slot of SCROLLABLE_SLOTS) {
                const texture = (material as any)[slot] as Texture | null | undefined;
                if (!texture || seen.has(texture)) continue;
                seen.add(texture);

                // offset only wraps cleanly if the texture repeats
                texture.wrapS = RepeatWrapping;
                texture.wrapT = RepeatWrapping;
                texture.needsUpdate = true;

                out.push({ texture, speed_u, speed_v });
            }
        });

        return out;
    }, [materials]);

    useFrame((state) => {
        if (targets.length === 0) return;

        const t = state.clock.elapsedTime;
        for (const { texture, speed_u, speed_v } of targets) {
            texture.offset.set((speed_u * t) % 1, (speed_v * t) % 1);
        }
    });
};
