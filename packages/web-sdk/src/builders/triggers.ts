import {BaseBuilder} from "./base";
import {
    Trigger,
    TriggerEventFilter,
    TriggerInput, TriggerSchema,
    TriggerTarget,
    TriggerTargetInput,
    TriggerTargetSchema
} from "@hyperlinkvr/vr-engine-schemas";

export class TriggerTargetBuilder extends BaseBuilder<TriggerTargetInput> {
    constructor(target_binding: string, command: string) {
        super({target: {name: target_binding}, command});
    }


    // fixed arguments
    set_arguments(args: Record<string, unknown>) {
        this._internal.arguments = args;
        return this;
    }

    set_argument(key: string, value: unknown) {
        this._internal.arguments = {...this._internal.arguments, [key]: value};
        return this;
    }

    // pulls a value out of the source report payload, for when an argument from the event is needed to pass to the target command
    map_argument(key: string, event_key: string) {
        this._internal.arguments_from_event = {
            ...this._internal.arguments_from_event,
            [key]: event_key
        };
        return this;
    }

    build(): TriggerTarget {
        return TriggerTargetSchema.parse(this._internal);
    }
}

export class TriggerBuilder extends BaseBuilder<TriggerInput> {
    constructor(source_binding: string) {
        super({source: {name: source_binding}, targets: []});
    }

    // shallow equality against the report payload. every key must match, and an array value matches if any element does
    // TODO: more expressive filtering options
    set_event_filter(filter: TriggerEventFilter) {
        this._internal.event_filter = filter;
        return this;
    }

    // narrows to one variant of the source's payload, e.g. "press" on a button monitor or "cast" on a raycast
    filter_event_type(type: string | string[]) {
        this._internal.event_filter = {...this._internal.event_filter, type};
        return this;
    }

    add_target(target: TriggerTarget) {
        this._internal.targets.push(target);
        return this;
    }

    set_targets(targets: TriggerTarget[]) {
        this._internal.targets = targets;
        return this;
    }

    // rate limits the whole trigger, not each target
    set_cooldown(cooldown_ms: number) {
        this._internal.cooldown_ms = cooldown_ms;
        return this;
    }

    build(): Trigger {
        // the schema enforces this too, but the builder can say which trigger
        if (this._internal.targets.length === 0) {
            throw new Error(
                `Trigger from "${this._internal.source.name}" has no targets. At least one target is required.`
            );
        }

        return TriggerSchema.parse(this._internal);
    }
}
