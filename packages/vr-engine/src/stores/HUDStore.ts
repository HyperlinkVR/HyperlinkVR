import {create} from "zustand";
import {
    CreatedHUDElement,
    HUDElementModification,
    HUDVRAnchor
} from "@hyperlinkvr/vr-engine-schemas";

export const LOCAL_PLAYER_KEY = "__local__";

export type HUDOverride = Omit<HUDElementModification, "id">;

export interface StoredHUDElement extends CreatedHUDElement {
    // insertion counter, used to break ties on equal order
    sequence: number;
    overrides: Record<string, HUDOverride>;
}

export type ResolvedHUDElement = CreatedHUDElement & { sequence: number };

interface HUDStoreState {
    elements: Record<string, StoredHUDElement>;
    next_sequence: number;

    add_element: (element: CreatedHUDElement) => void;
    remove_element: (element_id: string) => void;
    get_element: (element_id: string) => StoredHUDElement | undefined;
    modify_element: (
        element_id: string,
        changes: HUDElementModification,
        target_username: string | null | undefined
    ) => void;
    reset: (target_username: string | null | undefined) => void;

    // anchor null disables the anchor filter, which is what flat wants
    resolve_for: (username: string | null, anchor: HUDVRAnchor | null) => ResolvedHUDElement[];
}

const override_key = (target_username: string | null) =>
    target_username === null ? LOCAL_PLAYER_KEY : target_username;

const merge_override = (element: StoredHUDElement, override: HUDOverride | undefined): ResolvedHUDElement => {
    const {overrides, ...base} = element;

    if (!override) {
        return base;
    }

    const merged: ResolvedHUDElement = {
        ...base,
        visible: override.visible ?? base.visible,
        slot: override.slot ?? base.slot,
        order: override.order ?? base.order,
        vr_anchor: override.vr_anchor ?? base.vr_anchor
    };

    // null clears the offset, putting the element back into its slot's flow
    // undefined means the override doesn't affect the offset, so the existing offset is preserved
    if (override.offset !== undefined) {
        merged.offset = override.offset === null ? undefined : override.offset;
    }

    if (override.component) {
        merged.component = {...base.component, ...override.component} as CreatedHUDElement["component"];
    }

    return merged;
};

const in_scope = (element: StoredHUDElement, username: string | null) => {
    if (element.scope === "global") {
        return true;
    }

    return element.scope.usernames.includes(username);
};

export const useHUDStore = create<HUDStoreState>((set, get) => ({
    elements: {},
    next_sequence: 0,

    add_element: (element) => set((state) => ({
        elements: {
            ...state.elements,
            [element.id]: {...element, sequence: state.next_sequence, overrides: {}}
        },
        next_sequence: state.next_sequence + 1
    })),

    remove_element: (element_id) => set((state) => {
        const {[element_id]: removed, ...remaining} = state.elements;
        return {elements: remaining};
    }),

    get_element: (element_id) => get().elements[element_id],

    modify_element: (element_id, changes, target_username) => set((state) => {
        const stored = state.elements[element_id];
        if (!stored) {
            console.warn("Modification for unknown HUD element", element_id);
            return state;
        }

        const {id, ...applied} = changes;

        // undefined targets the element itself, so the change becomes the new shared default
        if (target_username === undefined) {
            const {overrides, sequence, ...base} = stored;
            const next = merge_override(stored, applied);

            return {
                elements: {
                    ...state.elements,
                    [element_id]: {...next, sequence, overrides}
                }
            };
        }

        const key = override_key(target_username);

        return {
            elements: {
                ...state.elements,
                [element_id]: {
                    ...stored,
                    overrides: {
                        ...stored.overrides,
                        [key]: {...stored.overrides[key], ...applied}
                    }
                }
            }
        };
    }),

    reset: (target_username) => set((state) => {
        // resetting everyone drops the elements entirely
        if (target_username === undefined) {
            return {elements: {}};
        }

        // resetting one player only drops their overrides, leaving the declaration intact
        const key = override_key(target_username);
        const elements: Record<string, StoredHUDElement> = {};

        for (const [element_id, stored] of Object.entries(state.elements)) {
            const {[key]: dropped, ...remaining} = stored.overrides;
            elements[element_id] = {...stored, overrides: remaining};
        }

        return {elements};
    }),

    resolve_for: (username, anchor) => {
        const key = override_key(username);

        return Object.values(get().elements)
            .filter((stored) => in_scope(stored, username))
            .map((stored) => merge_override(stored, stored.overrides[key]))
            .filter((element) => element.visible)
            .filter((element) => anchor === null || element.vr_anchor === anchor)
            .sort((left, right) => left.order - right.order || left.sequence - right.sequence);
    }
}));
