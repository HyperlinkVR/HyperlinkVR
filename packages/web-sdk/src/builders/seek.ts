import type {
    PredictSeekConfigInput,
    SeekConfig,
    SeekConfigInput,
    SeekTargetInput
} from "@hyperlinkvr/vr-engine-schemas";
import {
    SeekConfigSchema,
} from "@hyperlinkvr/vr-engine-schemas";



import { send_via_rtc } from "../messenger";
import { BaseBuilder } from "./base";


/** @group Animation */
export interface SeekHandle {
    stop: () => Promise<void>;
}

/** @group Animation */
export class SeekBuilder extends BaseBuilder<SeekConfigInput> {
    #object_id: string;
    #burned = false;

    constructor(object_id: string) {
        super({} as SeekConfigInput);
        this.#object_id = object_id;
    }

    set_target(target: SeekTargetInput) {
        this._internal.target = target;
        return this;
    }

    toward_point(x: number, y: number, z: number) {
        this._internal.target = { kind: "point", position: [x, y, z] };
        return this;
    }

    
    toward_object(object_id: string) {
        this._internal.target = { kind: "object", object_id };
        return this;
    }

    
    toward_player(username?: string) {
        this._internal.target = { kind: "player", username };
        return this;
    }
    
    speed(units_per_second: number) {
        this._internal.speed = units_per_second;
        return this;
    }

    
    kinematic() {
        this._internal.mode = "kinematic";
        return this;
    }

    
    dynamic() {
        this._internal.mode = "dynamic";
        return this;
    }

    
    direct() {
        this._internal.strategy = "direct";
        return this;
    }

    
    predict(lead_max: number) {
        this._internal.strategy = "predict";
        (this._internal as PredictSeekConfigInput).lead_max = lead_max;
        return this;
    }

    set_distance(distance: number, stop_at_distance = false) {
        this._internal.distance = distance;
        this._internal.stop_at_distance = stop_at_distance;
        return this;
    }

    lock_y(lock = true) {
        this._internal.lock_y = lock;
        return this;
    }

    
    face_target(face = true) {
        this._internal.face_target = face;
        return this;
    }

    build(): SeekConfig {
        return SeekConfigSchema.parse(this._internal);
    }

    async start(): Promise<SeekHandle> {
        if (this.#burned) {
            throw new Error("This seek builder has already been started.");
        }

        const built = this.build();

        this.#burned = true;
        await send_via_rtc({
            action: "HVRSDK_SEEK_ENGINE_OBJECT",
            object_id: this.#object_id,
            config: built,
        });

        return {
            stop: async () => {
                await send_via_rtc({
                    action: "HVRSDK_STOP_SEEK_ENGINE_OBJECT",
                    object_id: this.#object_id
                });
            }
            // TODO: is it worth having a lightweight retarget message that doesnt send the whole config?
        };
    }
}
