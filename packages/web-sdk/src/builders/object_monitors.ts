import {BaseBuilder} from "./base";
import type {AxesBasedMonitorInput, AxisRange, ObjectMonitor} from "@hyperlinkvr/vr-engine-schemas";
import { ObjectMonitorSchema} from "@hyperlinkvr/vr-engine-schemas";

class AxesBasedMonitorBuilder extends BaseBuilder<AxesBasedMonitorInput> {
    constructor(type: "position" | "rotation" | "linear-velocity" | "angular-velocity",) {
        super({type});
    }

    when(cond: "any" | "all" | "xor") {
        this._internal.when = cond;
        return this;
    }

    continuous(is_continuous: boolean, options: {ignored_unchanged?: boolean, min_change_delta?: number} = {}) {
        if (!this._internal.continuous) {
            this._internal.continuous = {};
        }

        this._internal.continuous.enabled = is_continuous;
        if (options.ignored_unchanged !== undefined) {
            this._internal.continuous.ignored_unchanged = options.ignored_unchanged;
        }
        if (options.min_change_delta !== undefined) {
            this._internal.continuous.min_change_delta = options.min_change_delta;
        }

        return this;
    }

    x(range: AxisRange) {
        this._internal.x = range;
        return this;
    }

    y(range: AxisRange) {
        this._internal.y = range;
        return this;
    }

    z(range: AxisRange) {
        this._internal.z = range;
        return this;
    }

    build(): ObjectMonitor {
        return ObjectMonitorSchema.parse(this._internal);
    }
}

export class PositionMonitorBuilder extends AxesBasedMonitorBuilder {
    constructor() {
        super("position");
    }
}

export class RotationMonitorBuilder extends AxesBasedMonitorBuilder {
    constructor() {
        super("rotation");
    }
}

export class LinearVelocityMonitorBuilder extends AxesBasedMonitorBuilder {
    constructor() {
        super("linear-velocity");
    }
}

export class AngularVelocityMonitorBuilder extends AxesBasedMonitorBuilder {
    constructor() {
        super("angular-velocity");
    }
}
