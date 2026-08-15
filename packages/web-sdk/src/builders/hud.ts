import {BaseBuilder} from "./base";
import {
    CreatedHUDElement,
    HUDComponentInput,
    HUDDispatch,
    HUDDispatchInput,
    HUDDispatchSchema,
    HUDElementModification,
    HUDElementModificationInput,
    HUDElementModificationSchema,
    HUDSlotOrShorthand,
    HUDTextComponentInput,
    HUDVRAnchor,
    TweenEasingInput,
    TweenSchema
} from "@hyperlinkvr/vr-engine-schemas";
import {send_via_rtc} from "../messenger";
import {BindingMap} from "./triggers";

// undefined writes the element's own scope, a value writes one player's override
export type HUDUpdateTarget = string | null | undefined;

export class HUDElementModificationBuilder<ComponentInput extends HUDComponentInput>
    extends BaseBuilder<HUDElementModificationInput> {
    #burned = false;
    #target: HUDUpdateTarget;

    constructor(element_id: string, target: HUDUpdateTarget) {
        super({id: element_id} as HUDElementModificationInput);
        this.#target = target;
    }

    // rescope the handle
    for_player(username: string | null) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this.#target = username;
        return this;
    }

    set_component(changes: Partial<ComponentInput>) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.component = {
            ...this._internal.component,
            ...changes
        };
        return this;
    }

    set_visible(visible: boolean) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.visible = visible;
        return this;
    }

    set_slot(slot: HUDSlotOrShorthand) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.slot = slot;
        return this;
    }

    set_order(order: number) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.order = order;
        return this;
    }

    // providing an offset takes this element out of its slot's flow, so it will no longer stack against siblings
    set_offset(x_or_offset: number | [number, number], y?: number) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        const [x, y_value] = Array.isArray(x_or_offset) ? x_or_offset : [x_or_offset, y!];
        this._internal.offset = [x, y_value];
        return this;
    }

    // null rather than undefined, so the engine can tell "back into flow" from "leave alone"
    clear_offset() {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.offset = null;
        return this;
    }

    set_vr_anchor(anchor: HUDVRAnchor) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.vr_anchor = anchor;
        return this;
    }

    build(): HUDElementModification {
        return HUDElementModificationSchema.parse(this._internal);
    }

    async apply(): Promise<void> {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        const built_modification = this.build();
        this.#burned = true;

        await send_via_rtc({
            action: "HVRSDK_UPDATE_HUD_ELEMENT",
            element_id: built_modification.id,
            changes: built_modification,
            target_username: this.#target
        });
    }

    async tween(duration_ms: number, easing?: TweenEasingInput): Promise<void> {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        // slot, order and visibility are discrete, so there is nothing to interpolate through
        if (this._internal.slot !== undefined || this._internal.order !== undefined
            || this._internal.visible !== undefined || this._internal.vr_anchor !== undefined) {
            throw new Error("Only offset and component changes may be tweened");
        }

        const built_modification = this.build();
        const tween = TweenSchema.parse({
            ms: duration_ms,
            easing
        });

        this.#burned = true;

        await send_via_rtc({
            action: "HVRSDK_UPDATE_HUD_ELEMENT",
            element_id: built_modification.id,
            changes: built_modification,
            target_username: this.#target,
            tween
        });
    }
}

export interface HUDElementHandleBase<ComponentInput extends HUDComponentInput> {
    readonly element: CreatedHUDElement;
    readonly bindings: BindingMap;
    readonly channels: string[]; // animation channels on this element, for keyframing

    destroy(): Promise<void>;

    modify(): HUDElementModificationBuilder<ComponentInput>;
}

export type HUDHandleCore<ComponentInput extends HUDComponentInput, Handle> =
    HUDElementHandleBase<ComponentInput> & {
    for_player(username: string | null): Handle;
};

export interface HUDElementHandle<ComponentInput extends HUDComponentInput>
    extends HUDElementHandleBase<ComponentInput> {
    for_player(username: string | null): HUDElementHandle<ComponentInput>;
}

export interface HUDTextHandle extends HUDElementHandleBase<HUDTextComponentInput> {
    for_player(username: string | null): HUDTextHandle;

    set_text(text: string): Promise<void>;
}

export abstract class HUDElementBuilder<
    ComponentInput extends HUDComponentInput,
    Handle extends HUDElementHandleBase<ComponentInput> = HUDElementHandle<ComponentInput>
> extends BaseBuilder<HUDDispatchInput> {
    #dispatched = false;

    protected constructor(name: string, component: ComponentInput) {
        super({
            component: {...component, binding: {name}},
            slot: "top-left"
        });
    }

    protected update_component(changes: Partial<ComponentInput>) {
        this._internal.component = {
            ...this._internal.component,
            ...changes
        } as HUDComponentInput;
        return this;
    }

    set_slot(slot: HUDSlotOrShorthand) {
        this._internal.slot = slot;
        return this;
    }

    set_order(order: number) {
        this._internal.order = order;
        return this;
    }

    // providing an offset takes this element out of its slot's flow, so it will no longer stack against siblings
    set_offset(x_or_offset: number | [number, number], y?: number) {
        const [x, y_value] = Array.isArray(x_or_offset) ? x_or_offset : [x_or_offset, y!];
        this._internal.offset = [x, y_value];
        return this;
    }

    clear_offset() {
        delete this._internal.offset;
        return this;
    }

    set_visible(visible: boolean) {
        this._internal.visible = visible;
        return this;
    }

    global() {
        this._internal.scope = "global";
        return this;
    }

    // null means the local player
    player(username: string | null) {
        this._internal.scope = {type: "player", usernames: [username]};
        return this;
    }

    players(...usernames: (string | null)[]) {
        if (usernames.length === 0) {
            throw new Error("players needs at least one username. Use global() for everyone.");
        }
        this._internal.scope = {type: "player", usernames};
        return this;
    }

    set_vr_anchor(anchor: HUDVRAnchor) {
        this._internal.vr_anchor = anchor;
        return this;
    }

    build(): HUDDispatch {
        return HUDDispatchSchema.parse(this._internal);
    }

    // element subclasses call to add extra methods to the handle, e.g. set_text for text elements
    protected abstract extend_handle(core: HUDHandleCore<ComponentInput, Handle>): Handle;

    async create(): Promise<Handle> {
        if (this.#dispatched) {
            throw new Error("This HUD element has already been created. Build a new one to dispatch again.");
        }
        this.#dispatched = true;

        const element = this.build();

        const bindings = new Map<string, string>();
        const binding_name = element.component.binding?.name;
        if (binding_name) {
            const binding_id = crypto.randomUUID();
            element.component.binding = {...element.component.binding, id: binding_id};
            bindings.set(binding_name, binding_id);
        }

        const response = await send_via_rtc({
            action: "HVRSDK_CREATE_HUD_ELEMENT",
            element
        });

        const created: CreatedHUDElement = response.element;
        const channels = response.channels ?? [];

        let destroyed = false;

        const make_handle = (bound_target: HUDUpdateTarget): Handle => {
            const core: HUDHandleCore<ComponentInput, Handle> = {
                element: created,
                bindings,
                channels,

                destroy: async () => {
                    if (destroyed) {
                        throw new Error("This HUD element has already been destroyed.");
                    }

                    destroyed = true;

                    await send_via_rtc({
                        action: "HVRSDK_DESTROY_HUD_ELEMENT",
                        element_id: created.id
                    });
                },

                modify: () => {
                    if (destroyed) {
                        throw new Error("This HUD element has already been destroyed.");
                    }

                    return new HUDElementModificationBuilder<ComponentInput>(created.id, bound_target);
                },

                for_player: (username) => make_handle(username)
            };

            return this.extend_handle(core);
        };

        // undefined means "whoever this element is scoped to"
        return make_handle(undefined);
    }
}

export class HUDTextBuilder extends HUDElementBuilder<HUDTextComponentInput, HUDTextHandle> {
    constructor(name: string, text: string) {
        super(name, {type: "text", text});
    }

    set_text(text: string) {
        return this.update_component({text});
    }

    set_font_size(font_size: number) {
        return this.update_component({font_size});
    }

    set_color(color: HUDTextComponentInput["color"]) {
        return this.update_component({color});
    }

    protected extend_handle(core: HUDHandleCore<HUDTextComponentInput, HUDTextHandle>): HUDTextHandle {
        return {
            ...core,
            // sugar for core.modify().set_component({text}).apply()
            set_text: (text) => core.modify().set_component({text}).apply()
        };
    }
}

export const hud_text = (name: string, text: string) => new HUDTextBuilder(name, text);

/*
usage example

const {hud_text} = hyperlinkvr.builders;

const score = await hud_text("score", "Score: 0")
    .set_slot("top-left")
    .set_font_size(48)
    .create();

const timer = await hud_text("timer", "60")
    .set_slot("top-center")
    .set_font_size(64)
    .set_color("#FFDD00")
    .create();

let points = 0;
let seconds_remaining = 60;

const countdown = setInterval(async () => {
    seconds_remaining -= 1;
    await timer.set_text(String(seconds_remaining));

    if (seconds_remaining <= 10) {
        await timer.modify().set_component({color: "#FF3333"}).apply();
    }

    if (seconds_remaining <= 0) {
        clearInterval(countdown);
        await timer.destroy();
        await score.modify().set_slot("middle-center").set_component({font_size: 96}).apply();
    }
}, 1000);

// somewhere in your game logic
const award = async (amount) => {
    points += amount;
    await score.set_text(`Score: ${points}`);
};
 */