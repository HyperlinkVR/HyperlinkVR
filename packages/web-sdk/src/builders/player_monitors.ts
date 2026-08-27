import {BaseBuilder} from "./base";
import type {
    AxisAction,
    AxisInputMonitorInput,
    ButtonInputMonitorInput,
    InputAction,
    PlayerMonitor} from "@hyperlinkvr/vr-engine-schemas";
import {
    PlayerMonitorSchema
} from "@hyperlinkvr/vr-engine-schemas";

const assert_source_unset = (already_assigned: boolean, builder_name: string) => {
    if (already_assigned) {
        throw new Error(
            `${builder_name} already has an input source. Use one source method per monitor, and create a second monitor if you need to watch a second input.`
        );
    }
};

/** @group Input Monitors */
export class ButtonInputMonitorBuilder extends BaseBuilder<ButtonInputMonitorInput> {
    #source_assigned = false;

    constructor() {
        super({type: "button-input"} as ButtonInputMonitorInput);
    }

    action(action: InputAction) {
        assert_source_unset(this.#source_assigned, "ButtonInputMonitorBuilder");
        this._internal.source = {kind: "action", action};
        this.#source_assigned = true;
        return this;
    }

    xr_button(code: string, hand: "left" | "right" | "either" = "either") {
        assert_source_unset(this.#source_assigned, "ButtonInputMonitorBuilder");
        this._internal.source = {kind: "raw", scheme: "xr", hand, code};
        this.#source_assigned = true;
        return this;
    }

    gamepad_button(code: string) {
        assert_source_unset(this.#source_assigned, "ButtonInputMonitorBuilder");
        this._internal.source = {kind: "raw", scheme: "gamepad", code};
        this.#source_assigned = true;
        return this;
    }

    key(code: string) {
        assert_source_unset(this.#source_assigned, "ButtonInputMonitorBuilder");
        this._internal.source = {kind: "raw", scheme: "kbm", code};
        this.#source_assigned = true;
        return this;
    }

    reports_press(reports = true) {
        this._internal.report_press = reports;
        return this;
    }

    reports_release(reports = true) {
        this._internal.report_release = reports;
        return this;
    }

    reports_hold(seconds: number) {
        if (!(seconds > 0)) {
            throw new Error(`Hold duration must be greater than zero, got ${seconds}.`);
        }

        this._internal.report_hold_seconds = seconds;
        return this;
    }

    build(): PlayerMonitor {
        if (!this.#source_assigned) {
            throw new Error(
                "ButtonInputMonitorBuilder has no input source. Call action(), xr_button(), gamepad_button() or key() before building."
            );
        }

        const reports_nothing =
            this._internal.report_press === false &&
            this._internal.report_release === false &&
            this._internal.report_hold_seconds === undefined;

        if (reports_nothing) {
            throw new Error(
                "ButtonInputMonitorBuilder reports nothing. Enable at least one of press, release or hold."
            );
        }

        return PlayerMonitorSchema.parse(this._internal);
    }
}

/** @group Input Monitors */
export class AxisInputMonitorBuilder extends BaseBuilder<AxisInputMonitorInput> {
    #source_assigned = false;

    constructor() {
        super({type: "axis-input"} as AxisInputMonitorInput);
    }

    action(action: AxisAction) {
        assert_source_unset(this.#source_assigned, "AxisInputMonitorBuilder");
        this._internal.source = {kind: "action", action};
        this.#source_assigned = true;
        return this;
    }

    xr_axis(hand: "left" | "right", control: "thumbstick" | "touchpad" | "trigger" | "grip") {
        assert_source_unset(this.#source_assigned, "AxisInputMonitorBuilder");
        this._internal.source = {kind: "raw", scheme: "xr", hand, control};
        this.#source_assigned = true;
        return this;
    }

    gamepad_axis(control: "left-stick" | "right-stick" | "left-trigger" | "right-trigger") {
        assert_source_unset(this.#source_assigned, "AxisInputMonitorBuilder");
        this._internal.source = {kind: "raw", scheme: "gamepad", control};
        this.#source_assigned = true;
        return this;
    }

    kbm_axis(control: "wasd" | "mouse-delta") {
        assert_source_unset(this.#source_assigned, "AxisInputMonitorBuilder");
        this._internal.source = {kind: "raw", scheme: "kbm", control};
        this.#source_assigned = true;
        return this;
    }

    min_change(delta: number) {
        if (delta < 0) {
            throw new Error(`Minimum change delta cannot be negative, got ${delta}.`);
        }

        this._internal.min_change_delta = delta;
        return this;
    }

    max_rate(hz: number) {
        if (!(hz > 0)) {
            throw new Error(`Maximum report rate must be greater than zero, got ${hz}.`);
        }

        this._internal.max_report_hz = hz;
        return this;
    }

    reports_settle(reports = true) {
        this._internal.report_settle = reports;
        return this;
    }

    build(): PlayerMonitor {
        if (!this.#source_assigned) {
            throw new Error(
                "AxisInputMonitorBuilder has no input source. Call action(), xr_axis(), gamepad_axis() or kbm_axis() before building."
            );
        }

        return PlayerMonitorSchema.parse(this._internal);
    }
}
