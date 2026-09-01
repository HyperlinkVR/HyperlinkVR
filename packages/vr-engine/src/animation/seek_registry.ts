import type { SeekConfig } from "@hyperlinkvr/vr-engine-schemas";
import { Vector3 } from "three";

export type ActiveSeek = SeekConfig & {
    id: string;
    on_arrive?: () => void;

    // predict strategy only
    est_vel: Vector3;
    last_target?: Vector3;
};

const active = new Map<string, ActiveSeek>();

export const set_active_seek = (seek: ActiveSeek) => {
    active.set(seek.id, seek);
};

export const cancel_active_seek = (id: string) => {
    active.delete(id);
};

export const get_active_seeks = () => active;
