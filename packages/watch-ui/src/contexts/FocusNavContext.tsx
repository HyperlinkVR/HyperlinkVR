import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode, useCallback
} from "react";
import { Object3D, Quaternion, Vector3 } from "three";

export type UISpatialDirection = "up" | "down" | "left" | "right";
export type UINavDirection = UISpatialDirection | "next";
export type UINavAction = UINavDirection | "accept" | "cancel";

type UINavListener = (action: UINavAction) => void;
const nav_listeners = new Set<UINavListener>();

export const dispatch_ui_nav = (action: UINavAction) => {
    for (const listener of nav_listeners) listener(action);
};

export type FocusOverrides = Partial<Record<UINavDirection, string | null>>; // undefined to leave geometric, null to disable, string to override with id

// the measurable node, any uikit ref exposing its hit mesh works
export type Measurable = Object3D | { interactionPanel: Object3D };

const resolve_node = (value: Measurable | null): Object3D | null => {
    if (!value) return null;
    if (value instanceof Object3D) return value;
    return value.interactionPanel ?? null;
};

interface FocusableEntry {
    id: string;
    order: number; // tree order: tab order + fallback
    get_node: () => Object3D | null;
    on_accept: () => void;
    on_cancel?: () => boolean; // true = consumed, stops the cancel from bubbling
    on_direction?: (direction: UISpatialDirection) => boolean; // true = consumed, focus doesnt move
    overrides?: FocusOverrides;
}

interface FocusNavContextType {
    focused_id: string | null;
    register: (entry: FocusableEntry) => () => void;
    focus: (id: string) => void;
}

const FocusNavContext = createContext<FocusNavContextType | null>(null);

let anonymous_counter = 1;
let order_counter = 1;

// scratch for geometric nav
const candidate_position = new Vector3();
const current_position = new Vector3();
const plane_quaternion = new Quaternion();
const plane_right = new Vector3();
const plane_up = new Vector3();
const delta = new Vector3();

// picks the best direction from current entry, in the UI's own plane
// score = distance along the direction + a penalty for sideways offset, the standard nav heuristic
const ORTHOGONAL_PENALTY = 2;

const find_geometric_neighbor = (
    entries: FocusableEntry[],
    current: FocusableEntry,
    direction: UISpatialDirection
): FocusableEntry | null => {
    const current_node = current.get_node();
    if (!current_node) {
        console.warn(`focusable "${current.id}" has no measurable node (ref not attached?)`);
        return null;
    }

    current_node.updateWorldMatrix(true, false);
    current_node.getWorldPosition(current_position);
    current_node.getWorldQuaternion(plane_quaternion);
    plane_right.set(1, 0, 0).applyQuaternion(plane_quaternion);
    plane_up.set(0, 1, 0).applyQuaternion(plane_quaternion);

    let best_in_cone: FocusableEntry | null = null;
    let best_in_cone_score = Infinity;
    let best_fallback: FocusableEntry | null = null;
    let best_fallback_score = Infinity;

    for (const candidate of entries) {
        if (candidate === current) continue;
        const node = candidate.get_node();
        if (!node) {
            console.warn(`focusable "${candidate.id}" has no measurable node (ref not attached?)`);
            continue;
        }

        node.updateWorldMatrix(true, false);
        node.getWorldPosition(candidate_position);
        delta.copy(candidate_position).sub(current_position);

        const along_right = delta.dot(plane_right);
        const along_up = delta.dot(plane_up);

        let forward: number;
        let sideways: number;
        switch (direction) {
            case "up": forward = along_up; sideways = along_right; break;
            case "down": forward = -along_up; sideways = along_right; break;
            case "left": forward = -along_right; sideways = along_up; break;
            case "right": forward = along_right; sideways = along_up; break;
        }

        if (forward < 1e-6) continue; // behind or level with us in this direction

        const score = forward + ORTHOGONAL_PENALTY * Math.abs(sideways);

        // pass 1: candidates inside a 90° cone around the direction
        // an aligned candidate always beats a diagonal one regardless of distance
        if (Math.abs(sideways) <= forward) {
            if (score < best_in_cone_score) {
                best_in_cone_score = score;
                best_in_cone = candidate;
            }
        } else if (score < best_fallback_score) {
            // pass 2 pool: only used when the cone is empty, so offset-only layouts stay reachable
            best_fallback_score = score;
            best_fallback = candidate;
        }
    }

    return best_in_cone ?? best_fallback;
};

const DIRECTIONS = new Set<UINavAction>(["up", "down", "left", "right"]);

export const FocusNavProvider = ({
    children,
    on_back
}: {
    children: ReactNode;
    on_back?: () => void;
}) => {
    const entries = useRef<FocusableEntry[]>([]);
    const [focused_id, set_focused_id] = useState<string | null>(null);
    const focused_id_ref = useRef<string | null>(null);

    const register = useCallback((entry: FocusableEntry) => {
        entries.current.push(entry);
        entries.current.sort((first, second) => first.order - second.order);
        return () => {
            entries.current = entries.current.filter((existing) => existing !== entry);
            const id_still_registered = entries.current.some(
                (existing) => existing.id === entry.id
            );
            if (focused_id_ref.current === entry.id && !id_still_registered) {
                focused_id_ref.current = null;
                set_focused_id(null);
            }
        };
    }, []);

    const focus = useCallback((id: string) => {
        if (focused_id_ref.current === id) return;
        // only focus things that actually exist, so a stale grab cant point nowhere
        if (!entries.current.some((entry) => entry.id === id)) return;
        focused_id_ref.current = id;
        set_focused_id(id);
    }, []);

    const context_value = useMemo<FocusNavContextType>(
        () => ({ focused_id, register, focus }),
        [focused_id, register]
    );

    const on_back_ref = useRef(on_back);
    on_back_ref.current = on_back;

    useEffect(() => {
        const on_nav = (action: UINavAction) => {
            const list = entries.current;
            const current = list.find((entry) => entry.id === focused_id_ref.current) ?? null;

            if (action === "cancel") {
                if (current?.on_cancel?.()) return; // widget consumed it (closed a dropdown etc)
                on_back_ref.current?.();
                return;
            }

            if (list.length === 0) return;

            const apply_focus = (next_id: string | null) => {
                if (next_id === focused_id_ref.current) return;
                focused_id_ref.current = next_id;
                set_focused_id(next_id);
            };

            if (action === "accept") {
                current?.on_accept();
                return;
            }

            // nothing focused so first nav lands on the first item in tree order
            if (!current) {
                apply_focus(list[0]!.id);
                return;
            }

            if (action === "next") {
                // explicit override wins, tree order otherwise
                const override_id = current.overrides?.next;
                if (override_id === null) return; // explicitly disabled
                if (override_id) {
                    const target = list.find((entry) => entry.id === override_id);
                    if (target) {
                        apply_focus(target.id);
                        return;
                    }
                }

                const index = list.indexOf(current);
                apply_focus(list[(index + 1) % list.length]!.id);
                return;
            }

            if (DIRECTIONS.has(action)) {
                const direction = action as UISpatialDirection;

                // focused widget gets first refusal (slider adjusting, dropdown cycling)
                if (current.on_direction?.(direction)) return;

                // explicit override wins, geometric otherwise, stay put at edges
                const override_id = current.overrides?.[direction];
                if (override_id === null) return; // explicitly disabled
                if (override_id) {
                    const target = list.find((entry) => entry.id === override_id);
                    if (target) {
                        apply_focus(target.id);
                        return;
                    }
                }

                const neighbor = find_geometric_neighbor(list, current, direction);
                if (neighbor) apply_focus(neighbor.id);
            }
        };

        nav_listeners.add(on_nav);
        return () => {
            nav_listeners.delete(on_nav);
        };
    }, []);

    return <FocusNavContext.Provider value={context_value}>{children}</FocusNavContext.Provider>;
};

export interface UseFocusableNeighboursOptions {
    id?: string; // needed only to be targeted by someone else's overrides
    overrides?: FocusOverrides; // override directions from geometric nav to a specific id
    disabled?: boolean; // removes from the tab order
}

// registers a focusable widget
export const useFocusable = (
    internals: { current: Measurable | null },
    events: { on_accept?: () => void; on_cancel?: () => boolean, on_direction?: (direction: UISpatialDirection) => boolean } = {},
    neighbours: UseFocusableNeighboursOptions = {}
): { is_focused: boolean; grab_focus: () => void } => {
    const context = useContext(FocusNavContext);
    if (context === null) throw new Error("useFocusable must be used within a FocusNavProvider");

    const auto_id_ref = useRef<string | null>(null);
    if (neighbours.id === undefined && auto_id_ref.current === null) {
        auto_id_ref.current = `focusable_${anonymous_counter++}`;
    }
    const id = neighbours.id ?? auto_id_ref.current!;

    const order_ref = useRef<number | null>(null);
    if (order_ref.current === null) {
        order_ref.current = order_counter++;
    }
    const order = order_ref.current;

    const on_activate_ref = useRef(events.on_accept);
    on_activate_ref.current = events.on_accept;
    const on_cancel_ref = useRef(events.on_cancel);
    on_cancel_ref.current = events.on_cancel;
    const on_direction_ref = useRef(events.on_direction);
    on_direction_ref.current = events.on_direction;
    const overrides_ref = useRef(neighbours.overrides);
    overrides_ref.current = neighbours.overrides;

    // TODO: on focus/blur events

    const { focused_id, register, focus } = context;

    useEffect(() => {
        if (neighbours.disabled) return;
        return register({
            id,
            order,
            get_node: () => resolve_node(internals.current),
            on_accept: () => on_activate_ref.current?.(),
            on_cancel: () => on_cancel_ref.current?.() ?? false,
            on_direction: (direction) => on_direction_ref.current?.(direction) ?? false,
            overrides: overrides_ref.current
        });
    }, [id, order, register, neighbours.disabled, internals]);

    const grab_focus = useCallback(() => focus(id), [focus, id]);

    return { is_focused: focused_id === id, grab_focus };
};
