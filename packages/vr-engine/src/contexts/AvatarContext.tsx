import { useDebounce, useStorage } from "@hyperlinkvr/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Object3D } from "three";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";





export const skin_tones = {
    unset: { base: 0xaaaaaa },

    // monk system, modified for warm and cool tint
    type1: { base: 0xf6ede4, warm: 0xf5e0d3, cool: 0xe6d2c1 },
    type2: { base: 0xf3e7db, warm: 0xf2d9c4, cool: 0xe5cbb3 },
    type3: { base: 0xf7ead0, warm: 0xf6d9b8, cool: 0xe9cba7 },
    type4: { base: 0xeadaba, warm: 0xd9c1a8, cool: 0xcbb08f },
    type5: { base: 0xd7bd96, warm: 0xc6a885, cool: 0xb99a74 },
    type6: { base: 0xa07e56, warm: 0x8f6c45, cool: 0x7e5b34 },
    type7: { base: 0x825c43, warm: 0x714b32, cool: 0x603a21 },
    type8: { base: 0x604134, warm: 0x503223, cool: 0x402212 },
    type9: { base: 0x3a312a, warm: 0x2b2219, cool: 0x1c1108 },
    type10: { base: 0x292420, warm: 0x1a1310, cool: 0x0b0200 },

    // some fantasy colours
    green: { base: 0x00ff00 },
    blue: { base: 0x0000ff },
    red: { base: 0xff0000 },
    purple: { base: 0x800080 },
    yellow: { base: 0xffff00 },
    orange: { base: 0xffa500 },
    pink: { base: 0xffc0cb },
    cyan: { base: 0x00ffff },
    magenta: { base: 0xff00ff },
};

export type SkinType = keyof typeof skin_tones;
export type SkinWarmth = "base" | "warm" | "cool";

export interface StoredAvatar {
    skin_type: SkinType;
    skin_warmth: SkinWarmth;

    hair_type?: number;
    hair_hex: number;

    nail_hex?: number;
    nail_roughness?: number;
}

export interface RetrievedAvatar extends StoredAvatar {
    skin_hex: number;
}

const default_avatar: StoredAvatar = {
    skin_type: "unset",
    skin_warmth: "base",
    hair_hex: 0xffffff,
};

export const stored_to_retrieved_avatar = (stored: StoredAvatar): RetrievedAvatar => {
    const skin_tone = skin_tones[stored.skin_type];
    // @ts-ignore
    const skin_hex = stored.skin_warmth in skin_tone ? skin_tone[stored.skin_warmth] : skin_tone.base;

    return {
        ...stored,
        skin_hex,
    };
}

export const retrieved_to_stored_avatar = (retrieved: RetrievedAvatar): StoredAvatar => {
    return {
        skin_type: retrieved.skin_type,
        skin_warmth: retrieved.skin_warmth,
        hair_hex: retrieved.hair_hex,
        nail_hex: retrieved.nail_hex,
    };
}

export interface AvatarContextType {
    avatar: RetrievedAvatar;
    setAvatar: (avatar: RetrievedAvatar | ((prev: RetrievedAvatar) => RetrievedAvatar)) => void;
}

const AvatarContext = createContext<AvatarContextType | null>(null);

export const AvatarProvider = ({ children }: { children: React.ReactNode }) => {
    const [stored_avatar, setStoredAvatar] = useStorage<StoredAvatar>(
        "sync",
        "avatar",
        default_avatar
    );

    // update locally quickly but debounce the storage update to avoid too many writes
    const [local_avatar, setLocalAvatar] = useState<StoredAvatar>(stored_avatar);
    const debounced_avatar = useDebounce<StoredAvatar>(local_avatar, 500);

    // sync local avatar with stored avatar
    useEffect(() => {
        setLocalAvatar(stored_avatar);
    }, [stored_avatar]);

    // sync stored avatar with debounced avatar only after first mount to avoid state race
    const is_first_mount = useRef(true);
    useEffect(() => {
        if (is_first_mount.current) {
            is_first_mount.current = false;
            return;
        }

        setStoredAvatar(debounced_avatar);
    }, [debounced_avatar, setStoredAvatar]);

    const retrieved_avatar: RetrievedAvatar = useMemo(
        () => stored_to_retrieved_avatar(local_avatar),
        [local_avatar]
    );

    const setRetrievedAvatar = useCallback(
        (retrieved: RetrievedAvatar | ((prev: RetrievedAvatar) => RetrievedAvatar)) => {
            setLocalAvatar((prev) => {
                const new_retrieved =
                    typeof retrieved === "function"
                        ? (
                              retrieved as (
                                  prev: RetrievedAvatar
                              ) => RetrievedAvatar
                          )(stored_to_retrieved_avatar(prev))
                        : retrieved;
                return retrieved_to_stored_avatar(new_retrieved);
            });
        },
        [setStoredAvatar]
    );

    return (
        <AvatarContext.Provider value={{ avatar: retrieved_avatar, setAvatar: setRetrievedAvatar }}>
            {children}
        </AvatarContext.Provider>
    );
}

export const useAvatar = () => {
    const context = useContext(AvatarContext);
    if (!context) {
        throw new Error("useAvatar must be used within an AvatarProvider");
    }
    return [context.avatar, context.setAvatar] as const;
}

export const useRetrievedAvatarProperty = <K extends keyof RetrievedAvatar>(property: K) => {
    const [avatar] = useAvatar();
    return avatar[property];
}

// export const useStoredAvatarProperty = <K extends keyof StoredAvatar>(property: K) => {
//     const [stored_avatar, setStoredAvatar] = useStorage<StoredAvatar>("sync", "avatar", default_avatar);
//     const value = stored_avatar[property];
//
//     const setValue = useCallback(
//         (new_value: StoredAvatar[K] | ((prev: StoredAvatar[K]) => StoredAvatar[K])) => {
//             setStoredAvatar((prev) => {
//                 const computed =
//                     typeof new_value === "function"
//                         ? (new_value as Function)(prev[property])
//                         : new_value;
//
//                 return {
//                     ...prev,
//                     [property]: computed
//                 };
//             });
//         },
//         [property, setStoredAvatar]
//     );
//
//     return [value, setValue] as const;
// }
// TODO: fix the race condition and readd

// TODO: avatar slots

export const useAvatarMaterials = (scene?: Object3D | null) => {
    const [avatar] = useAvatar();

    const skin_material = useMemo(
        () =>
            new MeshStandardMaterial({
                color: 0x000000,
                roughness: 0.7
            }),
        []
    );
    useEffect(() => {
        if (avatar.skin_hex === undefined) {
            return;
        }

        skin_material.color.setHex(avatar.skin_hex);
    }, [avatar.skin_hex, skin_material]);

    const hair_material = useMemo(
        () =>
            new MeshStandardMaterial({
                color: 0x000000,
                roughness: 0.4,
            }),
        []
    );
    useEffect(() => {
        if (avatar.hair_hex === undefined) {
            return;
        }

        hair_material.color.setHex(avatar.hair_hex);
    }, [avatar.hair_hex, hair_material]);

    const pencil_material = useMemo(
        () =>
            new MeshBasicMaterial({
                color: 0x000000,
            }),
        []
    );

    // TODO: combine these into a shared material somehow? maybe context instead of hook? idk

    const replacements = useMemo(() => ({
        "Mat_Skin": skin_material,
        "Mat_Hair": hair_material,
        "Mat_Pencil": pencil_material
    }), []);

    // replace materials in the scene with the dynamic materials
    useEffect(() => {
        if (!scene) {
            return;
        }

        scene.traverse((object) => {
            if (object instanceof Mesh) {
                if (Array.isArray(object.material)) {
                    // array of materials

                    object.material = object.material.map((mat) => {
                        console.log(
                            `Replacing material ${object.material.name} with dynamic material`
                        );
                        // @ts-ignore
                        return replacements[mat.name] || mat;
                    });
                } else if (object.material.name in replacements) {
                    // single material
                    console.log(`Replacing material ${object.material.name} with dynamic material`);
                    // @ts-ignore
                    object.material = replacements[object.material.name];
                }
            }
        });
    }, [scene, replacements]);
}
