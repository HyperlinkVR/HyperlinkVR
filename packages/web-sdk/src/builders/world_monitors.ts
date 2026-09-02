import {BaseBuilder} from "./base";
import type {
    DistanceMonitorInput,
    SubjectRefInput,
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

/** @group World Monitors */
export class DistanceMonitorBuilder extends BaseBuilder<DistanceMonitorInput> {
    #range_assigned = false;

    constructor() {
        super({type: "distance"} as DistanceMonitorInput);
    }

    between(a: SubjectRefInput, b: SubjectRefInput) {
        this._internal.a = a;
        this._internal.b = b;
        return this;
    }

    from(a: SubjectRefInput) {
        this._internal.a = a;
        return this;
    }

    to(b: SubjectRefInput) {
        this._internal.b = b;
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
