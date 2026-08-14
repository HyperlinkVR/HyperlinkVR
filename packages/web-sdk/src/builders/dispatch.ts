import {
    Bindable,
    CreatedEngineObject,
    EngineObject,
    EngineObjectDispatch,
    EngineObjectDispatchInput,
    EngineObjectDispatchSchema,
    EngineObjectModification,
    EngineObjectModificationInput,
    EngineObjectModificationSchema,
    ObjectMonitor,
    PartialTransformInput,
    PrefabInput,
    ReportEvent,
    TransformInput, Trigger,
    TweenEasingInput,
    TweenSchema, Vector3, Vector3Schema, Vector4, Vector4Schema
} from "@hyperlinkvr/vr-engine-schemas";
import {BaseBuilder} from "./base";
import {subscribe_report} from "../event_bus";
import {send_via_rtc} from "../messenger";
import {_INTERACTION_API_MAKERS} from "./interactions";
import type {BindingMap} from "./triggers";

export interface EngineObjectCreationResult {
    object: CreatedEngineObject;
    interactions: Record<string, Function>;
    bindings: BindingMap;
    destroy: () => Promise<void>;
    modify: () => EngineObjectModificationBuilder;
    refresh: () => Promise<void>;
}

// triggers are authored against binding names, but the engine only ever routes on the id
// the map is built once at create time and carried forward so later modifications can resolve the same names without the engine having to store them
const resolve_trigger_bindings = (triggers: Trigger[], binding_ids: Map<string, string>) => {
    for (const trigger of triggers) {
        const source_name = trigger.source.name;
        const source_id = source_name ? binding_ids.get(source_name) : trigger.source.id;

        if (!source_id) {
            const known = [...binding_ids.keys()].map((name) => `"${name}"`).join(", ");
            throw new Error(
                `Trigger source "${source_name}" matches no named binding on this object. Known bindings: ${known || "none"}.`
            );
        }

        trigger.source = {...trigger.source, id: source_id};

        for (const target of trigger.targets) {
            const target_name = target.target.name;
            const target_id = target_name ? binding_ids.get(target_name) : target.target.id;

            if (!target_id) {
                const known = [...binding_ids.keys()].map((name) => `"${name}"`).join(", ");
                throw new Error(
                    `Trigger target "${target_name}" matches no named binding on this object. Known bindings: ${known || "none"}.`
                );
            }

            target.target = {...target.target, id: target_id};
        }
    }
};

class EngineObjectModificationBuilder extends BaseBuilder<EngineObjectModificationInput> {
    //#source: EngineObjectCreationResult;
    #burned = false;

    // name to binding id for everything already on the object, plus anything this modification adds
    #binding_ids: Map<string, string>;

    //constructor(source: EngineObjectCreationResult) {
    //super({ id: source.object.id } as EngineObjectModificationInput);
    //this.#source = source;
    //}
    constructor(id: string, binding_ids?: Map<string, string>) {
        super({id} as EngineObjectModificationInput);
        this.#binding_ids = new Map(binding_ids ?? []);
    }

    set_position(x_or_vect: number | Vector3, y?: number, z?: number) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!];
        this._internal.transform.position = Vector3Schema.parse([x, y_val, z_val]);
        return this;
    }

    set_euler_rotation(x_or_vect: number | Vector3, y?: number, z?: number) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!];
        this._internal.transform.rotation = Vector3Schema.parse([x, y_val, z_val]);
        return this;
    }

    set_quaternion_rotation(x_or_vect: number | Vector4, y?: number, z?: number, w?: number) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val, w_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!, w!];
        this._internal.transform.rotation = Vector4Schema.parse([x, y_val, z_val, w_val]);
        return this;
    }

    set_scale(x_or_vect: number | Vector3, y?: number, z?: number) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!];
        this._internal.transform.scale = Vector3Schema.parse([x, y_val, z_val]);
        return this;
    }

    set_transform(transform: PartialTransformInput) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.transform = transform;
        return this;
    }

    set_user_data_value(key: string, value: any) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.user_data) {
            this._internal.user_data = {};
        }
        this._internal.user_data[key] = value;
        return this;
    }

    set_user_data(user_data: Record<string, any>) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.user_data = user_data;
        return this;
    }

    add_monitor(name: string, monitor: ObjectMonitor) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.monitors) {
            this._internal.monitors = [];
        }

        // minted here rather than at create time, so a trigger added in this same modification can source from it by name
        const id = crypto.randomUUID();
        this.#binding_ids.set(name, id);

        this._internal.monitors.push({...monitor, binding: {name, id}});
        return this;
    }

    remove_monitors_from_modification(name: string) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.monitors) {
            throw new Error("No monitors to remove.");
        }

        // multiple monitors are allowed to have the same name, so remove all with that name but check if any were actually removed
        const original_length = this._internal.monitors.length;
        this._internal.monitors = this._internal.monitors.filter((monitor) => monitor.binding?.name !== name);

        if (this._internal.monitors.length === original_length) {
            throw new Error(`No monitors were found with name "${name}".`);
        }

        this.#binding_ids.delete(name);
        return this;
    }

    // TODO: way to remove monitors from source object, need to pull in its state

    add_monitors(monitors: { name: string, monitor: ObjectMonitor }[]) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        for (const {name, monitor} of monitors) {
            this.add_monitor(name, monitor);
        }

        return this;
    }

    add_trigger(trigger: Trigger) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.triggers) {
            this._internal.triggers = [];
        }

        this._internal.triggers.push(trigger);
        return this;
    }

    add_triggers(triggers: Trigger[]) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.triggers) {
            this._internal.triggers = [];
        }

        this._internal.triggers.push(...triggers);
        return this;
    }

    remove_triggers_from_modification(source_name: string) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.triggers) {
            throw new Error("No triggers to remove.");
        }

        const original_length = this._internal.triggers.length;
        this._internal.triggers = this._internal.triggers.filter(
            (trigger) => trigger.source.name !== source_name
        );

        if (this._internal.triggers.length === original_length) {
            throw new Error(`No triggers were found with source "${source_name}".`);
        }

        return this;
    }

    // TODO: way to remove triggers from source object, need to pull in its state

    set_triggers(triggers: Trigger[]) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.triggers = triggers;
        return this;
    }

    add_tag(tag: string) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.tags) {
            this._internal.tags = [];
        }
        this._internal.tags.push(tag);
        return this;
    }

    remove_tag_from_modification(tag: string) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (!this._internal.tags) {
            return this;
        }
        this._internal.tags = this._internal.tags.filter(t => t !== tag);
        return this;
    }

    // TODO: way to remove tags from source object, need to pull in its state

    set_tags(tags: string[]) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        this._internal.tags = tags;
        return this;
    }

    modification_has_tag(tag: string): boolean {
        return this._internal.tags?.includes(tag) ?? false;
    }

    // TODO: way to check if source object has tag, need to pull in its state

    build(): EngineObjectModification {
        const built = EngineObjectModificationSchema.parse(this._internal);

        if (built.triggers) {
            resolve_trigger_bindings(built.triggers, this.#binding_ids);
        }

        return built;
    }

    async apply(): Promise<void> {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        const built_modification = this.build();
        this.#burned = true;
        await send_via_rtc({
            action: "HVRSDK_MODIFY_ENGINE_OBJECT",
            object_id: this._internal.id,
            changes: built_modification,
        });

        // // apply the changes to the cached object
        // this.#source.object = Object.freeze({
        //     ...this.#source.object,
        //     transform: {
        //         ...this.#source.object.transform,
        //         ...built_modification.transform
        //     },
        //     user_data: {
        //         ...this.#source.object.user_data,
        //         ...built_modification.user_data
        //     }
        // });
    }

    async tween(duration_ms: number, easing?: TweenEasingInput) {
        if (this.#burned) {
            throw new Error("This modification builder has already been applied.");
        }

        if (this._internal.user_data || this._internal.monitors || this._internal.triggers) {
            throw new Error("Only transform changes may be tweened");
        }

        const built_modification = this.build();
        const tween = TweenSchema.parse({
            ms: duration_ms,
            easing,
        });

        this.#burned = true;
        await send_via_rtc({
            action: "HVRSDK_MODIFY_ENGINE_OBJECT",
            object_id: this._internal.id,
            changes: built_modification,
            tween
        });

        // // could tween the changes to the cached object, for now just wait for the delay then apply the final state
        // await new Promise((resolve) => setTimeout(resolve, duration_ms));
        //
        // this.#source.object = Object.freeze({
        //     ...this.#source.object,
        //     transform: {
        //         ...this.#source.object.transform,
        //         ...built_modification.transform
        //     },
        //     user_data: {
        //         ...this.#source.object.user_data,
        //         ...built_modification.user_data
        //     }
        // });
    }
}

export class EngineObjectDispatchBuilder extends BaseBuilder<EngineObjectDispatchInput> {
    #callbacks = new Map<string, (event: ReportEvent) => void>();

    constructor() {
        super({} as EngineObjectDispatchInput);
    }

    set_object(object: EngineObject) {
        this._internal.object = object;
        return this;
    }

    set_position(x_or_vect: number, y?: number, z?: number) {
        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!];
        this._internal.transform.position = Vector3Schema.parse([x, y_val, z_val]);
        return this;
    }

    set_euler_rotation(x_or_vect: number | Vector3, y?: number, z?: number) {
        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!];
        this._internal.transform.rotation = Vector3Schema.parse([x, y_val, z_val]);
        return this;
    }

    set_quaternion_rotation(x_or_vect: number | Vector4, y?: number, z?: number, w?: number) {
        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val, w_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!, w!];
        this._internal.transform.rotation = Vector4Schema.parse([x, y_val, z_val, w_val]);
        return this;
    }

    set_scale(x_or_vect: number | Vector3, y?: number, z?: number) {
        if (!this._internal.transform) {
            this._internal.transform = {};
        }

        const [x, y_val, z_val] = Array.isArray(x_or_vect) ? x_or_vect : [x_or_vect, y!, z!];
        this._internal.transform.scale = Vector3Schema.parse([x, y_val, z_val]);
        return this;
    }

    set_transform(transform: TransformInput) {
        this._internal.transform = transform;
        return this;
    }

    set_user_data_value(key: string, value: any) {
        if (!this._internal.user_data) {
            this._internal.user_data = {};
        }
        this._internal.user_data[key] = value;
        return this;
    }

    set_user_data(user_data: Record<string, any>) {
        this._internal.user_data = user_data;
        return this;
    }

    add_monitor(name: string, monitor: ObjectMonitor) {
        if (!this._internal.monitors) {
            this._internal.monitors = [];
        }
        this._internal.monitors.push({...monitor, binding: {name}});
        return this;
    }

    add_monitors(monitors: { name: string, monitor: ObjectMonitor }[]) {
        if (!this._internal.monitors) {
            this._internal.monitors = [];
        }
        this._internal.monitors.push(...monitors.map(({name, monitor}) => ({...monitor, binding: {name}})));
        return this;
    }

    set_monitors(monitors: { name: string, monitor: ObjectMonitor }[]) {
        this._internal.monitors = monitors.map(({name, monitor}) => ({...monitor, binding: {name}}));
        return this;
    }

    add_trigger(trigger: Trigger) {
        if (!this._internal.triggers) {
            this._internal.triggers = [];
        }
        this._internal.triggers.push(trigger);
        return this;
    }

    add_triggers(triggers: Trigger[]) {
        if (!this._internal.triggers) {
            this._internal.triggers = [];
        }
        this._internal.triggers.push(...triggers);
        return this;
    }

    set_triggers(triggers: Trigger[]) {
        this._internal.triggers = triggers;
        return this;
    }

    add_tag(tag: string) {
        if (!this._internal.tags) {
            this._internal.tags = [];
        }
        this._internal.tags.push(tag);
        return this;
    }

    remove_tag(tag: string) {
        if (!this._internal.tags) {
            return this;
        }
        this._internal.tags = this._internal.tags.filter(t => t !== tag);
        return this;
    }

    set_tags(tags: string[]) {
        this._internal.tags = tags;
        return this;
    }

    has_tag(tag: string): boolean {
        return this._internal.tags?.includes(tag) ?? false;
    }

    on(name: string, callback: (event: ReportEvent) => void) {
        if (this.#callbacks.has(name)) {
            throw new Error(`A callback is already bound for "${name}".`);
        }
        this.#callbacks.set(name, callback);
        return this;
    }

    build(): EngineObjectDispatch {
        return EngineObjectDispatchSchema.parse(this._internal);
    }

    #bind_callbacks(dispatch: EngineObjectDispatch) {
        // every named reporting source in this dispatch, plus how to stamp its id back
        const named_sources: Array<{ name: string; assign_id: (id: string) => void }> = [];

        // progressively bound as ids acquired with currying
        const unbound_interaction_apis: Record<string, (binding_id: string) => (object_id: string) => any> = {};
        const partially_bound_interaction_apis: Record<string, (object_id: string) => any> = {};

        // find all interactions with binding names
        if (dispatch.object.type === "custom" && dispatch.object.interactions) {
            for (const interaction of dispatch.object.interactions) {
                const name = "binding" in interaction && interaction.binding?.name ? interaction.binding.name : null;

                if (name) {
                    if (interaction.type in _INTERACTION_API_MAKERS) {
                        const make_api = _INTERACTION_API_MAKERS[interaction.type];
                        unbound_interaction_apis[name] = (binding_id) => (object_id) => make_api(object_id, binding_id);
                    }

                    named_sources.push({
                        name,
                        assign_id: (id) => {
                            const bindable = interaction as Bindable;
                            bindable.binding = {...bindable.binding, id};

                            if (name in unbound_interaction_apis) {
                                // uncurry to bind the interaction id
                                partially_bound_interaction_apis[name] = unbound_interaction_apis[name](id);
                                console.log(`Bound interaction API for "${name}" with id ${id}`);
                            }
                        }
                    });
                }
            }
        }

        // if prefab has reporting, add it
        if (dispatch.object.type === "prefab" && "binding" in dispatch.object && dispatch.object.binding?.name) {
            const prefab_object = dispatch.object as PrefabInput;
            named_sources.push({
                name: dispatch.object.binding.name,
                assign_id: (id) => {
                    const bindable = prefab_object as Bindable;
                    bindable.binding = {...bindable.binding, id};
                }
            });
        }

        // add any reporting monitors
        for (const monitor of dispatch.monitors ?? []) {
            if (monitor.binding?.name) {
                named_sources.push({
                    name: monitor.binding.name,
                    assign_id: (id) => {
                        monitor.binding = {...monitor.binding, id};
                    }
                });
            }
        }

        const seen = new Set<string>();
        for (const source of named_sources) {
            if (seen.has(source.name)) {
                throw new Error(`Duplicate reporting name "${source.name}" in this dispatch.`);
            }
            seen.add(source.name);
        }

        // mint an id per bound source, stamp it into the outgoing data, subscribe
        const unsubscribes: Array<() => void> = [];
        const unbound = new Set(this.#callbacks.keys());

        // kept so triggers here and in later modifications can resolve the
        // author's binding names, which the engine never sees
        const binding_ids = new Map<string, string>();

        for (const source of named_sources) {
            const id = crypto.randomUUID();
            source.assign_id(id);
            binding_ids.set(source.name, id);

            const callback = this.#callbacks.get(source.name);
            if (!callback) {
                continue; // no callback bound for this source, so don't subscribe
            }

            unsubscribes.push(subscribe_report(id, callback));

            unbound.delete(source.name);
        }

        if (unbound.size > 0) {
            for (const unsubscribe of unsubscribes) unsubscribe();
            const missing = [...unbound].map((name) => `"${name}"`).join(", ");
            throw new Error(`No reporting source named ${missing} in this dispatch.`);
        }

        // swap names for ids now that every named source has one. throws on a
        // name that matches nothing, which is the only place a mistyped
        // trigger can be caught before it silently does nothing at runtime
        if (dispatch.triggers) {
            try {
                resolve_trigger_bindings(dispatch.triggers, binding_ids);
            } catch (e) {
                for (const unsubscribe of unsubscribes) unsubscribe();
                throw e;
            }
        }

        const bind_interaction_apis = (object_id: string) => {
            const apis: Record<string, Function> = {};

            // finalise binding of every api with the object id
            for (const api of Object.entries(partially_bound_interaction_apis)) {
                apis[api[0]] = api[1](object_id);
            }

            return apis;
        }

        return {unsubscribes, bind_interaction_apis, binding_ids};
    }

    async create(): Promise<EngineObjectCreationResult> {
        const built_object = this.build();
        const {unsubscribes, bind_interaction_apis, binding_ids} = this.#bind_callbacks(built_object);

        try {
            const created = (await send_via_rtc({
                action: "HVRSDK_CREATE_ENGINE_OBJECT",
                object: built_object
            }));
            // TODO: handle timeouts and errors

            let burned = false;
            const ret_val = {
                object: Object.freeze(created.object),
                interactions: bind_interaction_apis(created.object.id),
                bindings: new Map(binding_ids), // clone so the caller can't mutate the internal map
                destroy: async () => {
                    if (burned) {
                        throw new Error("This object has already been destroyed.");
                    }

                    burned = true;

                    for (const unsubscribe of unsubscribes) {
                        unsubscribe();
                    }

                    await send_via_rtc({
                        action: "HVRSDK_DESTROY_ENGINE_OBJECT",
                        object_id: created.object.id
                    });
                },
                modify: () => {
                    if (burned) {
                        throw new Error("This object has already been destroyed.");
                    }

                    return new EngineObjectModificationBuilder(created.object.id, binding_ids);
                },
                refresh: async () => {
                    if (burned) {
                        throw new Error("This object has already been destroyed.");
                    }

                    const refreshed = (await send_via_rtc({
                        action: "HVRSDK_REFRESH_ENGINE_OBJECT",
                        object_id: created.object.id
                    }));

                    ret_val.object = Object.freeze(refreshed.object);
                }
            } satisfies EngineObjectCreationResult;

            return ret_val;
        } catch (e) {
            for (const unsubscribe of unsubscribes) {
                unsubscribe();
            }

            throw e;
        }
    }
}