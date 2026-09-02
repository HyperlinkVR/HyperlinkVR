import {BaseBuilder} from "./base";
import type {
    DistanceMonitorInput,
    SubjectRefInput,
    TargetRefInput,
    WorldMonitor} from "@hyperlinkvr/vr-engine-schemas";
import {
    WorldMonitorSchema
} from "@hyperlinkvr/vr-engine-schemas";



/** @group World Monitors */
export const object_subject = (id: string): SubjectRefInput => ({kind: "object", id});

/** @group World Monitors */
export const player_subject = (username: string | null = null): SubjectRefInput => ({
    kind: "player",
    username
});

// TODO: tag filters

/** @group World Monitors */
export const any_object = (): TargetRefInput => ({kind: "any-object"});

/** @group World Monitors */
export const any_player = (): TargetRefInput => ({kind: "any-player"});

/** @group World Monitors */
export const any_subject = (): TargetRefInput => ({kind: "any"});

// an object handle (from EngineObjectDispatchBuilder.create()) or a Player can be
// passed straight in; the subject ref is derived from it
type ObjectHandleLike = {object: {id: string}};
type PlayerLike = {get_stored_username: () => string | null};

/** @group World Monitors */
export type SubjectLike = TargetRefInput | ObjectHandleLike | PlayerLike;

const to_target_ref = (subject: SubjectLike): TargetRefInput => {
    if ("kind" in subject) {
        return subject;
    }
    if ("get_stored_username" in subject && typeof subject.get_stored_username === "function") {
        return {kind: "player", username: subject.get_stored_username()};
    }
    if ("object" in subject && subject.object && typeof subject.object.id === "string") {
        return {kind: "object", id: subject.object.id};
    }
    throw new Error(
        "Expected a target ref, an object handle, or a Player. Use object_subject()/player_subject()/any_object() or pass a created object handle or Player."
    );
};

/** @group World Monitors */
export class DistanceMonitorBuilder extends BaseBuilder<DistanceMonitorInput> {
    #range_assigned = false;

    constructor() {
        super({type: "distance"} as DistanceMonitorInput);
    }

    between(a: SubjectLike, b: SubjectLike) {
        this._internal.a = to_target_ref(a);
        this._internal.b = to_target_ref(b);
        return this;
    }

    // convenience setters for the individual ends, so you can read from(...).to(...)
    from(a: SubjectLike) {
        this._internal.a = to_target_ref(a);
        return this;
    }

    to(b: SubjectLike) {
        this._internal.b = to_target_ref(b);
        return this;
    }

    closer_than(distance: number) {
        this._internal.range = {max: distance};
        this.#range_assigned = true;
        return this;
    }

    further_than(distance: number) {
        this._internal.range = {min: distance};
        this.#range_assigned = true;
        return this;
    }

    // fires while the pair sits in the band, i.e. between min and max apart
    in_range(min: number, max: number) {
        if (min > max) {
            throw new Error(`in_range needs min <= max, got min ${min} and max ${max}.`);
        }
        this._internal.range = {min, max};
        this.#range_assigned = true;
        return this;
    }

    approximately(distance: number) {
        this._internal.range = {equals: distance};
        this.#range_assigned = true;
        return this;
    }

    // "xyz" full 3d (default), "xz" ground-plane only, "y" vertical gap only
    plane(plane: "xyz" | "xz" | "y") {
        this._internal.plane = plane;
        return this;
    }

    set_reports_enter(reports: boolean) {
        this._internal.report_enter = reports;
        return this;
    }

    set_reports_exit(reports: boolean) {
        this._internal.report_exit = reports;
        return this;
    }

    hysteresis(margin: number) {
        if (margin < 0) {
            throw new Error(`Hysteresis margin cannot be negative, got ${margin}.`);
        }
        this._internal.hysteresis = margin;
        return this;
    }

    build(): WorldMonitor {
        if (this._internal.a === undefined || this._internal.b === undefined) {
            throw new Error(
                "DistanceMonitorBuilder needs two subjects. Call between(a, b) or from(a).to(b) before building."
            );
        }

        if (!this.#range_assigned) {
            throw new Error(
                "DistanceMonitorBuilder has no range. Call closer_than(), further_than(), in_range() or approximately() before building."
            );
        }

        if (this._internal.report_enter === false && this._internal.report_exit === false) {
            throw new Error(
                "DistanceMonitorBuilder reports nothing. Enable at least one of enter or exit."
            );
        }

        return WorldMonitorSchema.parse(this._internal);
    }
}
