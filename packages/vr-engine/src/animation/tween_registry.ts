import type { Transform, TweenEasing } from "@hyperlinkvr/vr-engine-schemas";

export interface ActiveTween {
    id: string;
    from: Transform;
    to: Transform;
    easing: TweenEasing;
    duration_ms: number;
    start_ms: number;

    on_complete: () => void;
}

const active = new Map<string, ActiveTween>();

export const set_active_tween = (tween: ActiveTween) => {
    active.set(tween.id, tween);
};

export const cancel_active_tween = (id: string) => {
    active.delete(id);
};

export const get_active_tweens = () => active;
