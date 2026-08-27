import { useEffect, useMemo, useState } from "react";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import type { GLTF} from "three/examples/jsm/loaders/GLTFLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";



import { useAvatarMaterials } from "../contexts";
import type { ExpressionEyes} from "../contexts/PlayerExpressionContext";
import { expression_eyes_options, expression_mouth_options, usePlayerExpression } from "../contexts/PlayerExpressionContext";
import { Layer, LayerGroup } from "../render";


const decompressor = new DRACOLoader();
const loader = new GLTFLoader().setDRACOLoader(decompressor);
const load_glbs = async (url_map: Record<string, string>, glb_names: readonly string[]) => {
    const glb_promises: Promise<GLTF>[] = [];
    for (const name of glb_names) {
        const resolved_url = url_map[name];
        if (!resolved_url) {
            console.warn(`Asset URL not found for: ${name}`);
            continue;
        }
        glb_promises.push(loader.loadAsync(resolved_url));
    }

    return Promise.all(glb_promises).then((glbs) => {
        const glb_map: Record<string, GLTF> = {};
        for (let i = 0; i < glbs.length; i++) {
            glb_map[glb_names[i]!] = glbs[i]!;
        }
        return glb_map;
    });
}

//@ts-ignore vite feature
const eyes_modules = import.meta.glob("../../assets/player/face/eyes/*.glb", {
    eager: true,
    query: "?url",
    import: "default"
}) as Record<string, string>;

//@ts-ignore vite feature
const mouth_modules = import.meta.glob("../../assets/player/face/mouth/*.glb", {
    eager: true,
    query: "?url",
    import: "default"
}) as Record<string, string>;

const get_name = (path: string) => path.split("/").pop()?.replace(".glb", "") || "";

const eyes_urls = Object.fromEntries(
    Object.entries(eyes_modules).map(([path, url]) => [get_name(path), url])
);
const mouth_urls = Object.fromEntries(
    Object.entries(mouth_modules).map(([path, url]) => [get_name(path), url])
);

export const AvatarExpression = () => {
    const [eyes_glbs, setEyesGlbs] = useState<Record<
        ExpressionEyes,
        GLTF
    > | null>(null);
    const [mouth_glbs, setMouthGlbs] = useState<Record<string, GLTF> | null>(
        null
    );

    // load all glbs for quick switching between expressions
    useEffect(() => {
        load_glbs(eyes_urls, expression_eyes_options).then((glbs) => {
            setEyesGlbs(glbs as Record<ExpressionEyes, GLTF>);
        });

        load_glbs(mouth_urls, expression_mouth_options).then((glbs) => {
            setMouthGlbs(glbs as Record<string, GLTF>);
        });
    }, []);

    const expression = usePlayerExpression();

    const eye = useMemo(() => {
        if (!eyes_glbs) return null;
        return eyes_glbs[expression.eyes];
    }, [eyes_glbs, expression.eyes]);

    const mouth = useMemo(() => {
        if (!mouth_glbs) return null;
        return mouth_glbs[expression.mouth];
    }, [mouth_glbs, expression.mouth]);

    useAvatarMaterials(eye?.scene);
    useAvatarMaterials(mouth?.scene);

    if (!eye || !mouth) {
        return null;
    }

    return (
        <LayerGroup layers={[Layer.PlayerModel_Head]} name="AvatarExpression">
            <primitive object={eye.scene} />
            <primitive object={mouth.scene} />
        </LayerGroup>
    );
};
// TODO: 2-frame animation style
