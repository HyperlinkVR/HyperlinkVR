import {useFrame} from "@react-three/fiber";
import {Quaternion} from "three";
import {get_animation_channel, type ChannelValue} from "./channel_registry";
import {get_active_animations, release_animation, sample_time} from "./playback";
import type {CompiledTrack} from "./tracks";

const to_channel_value = (buffer: ArrayLike<number | boolean | string>, scalar: boolean): ChannelValue =>
    scalar ? (buffer[0] as ChannelValue) : (Array.from(buffer) as number[]);

const base_quat = new Quaternion(), local_quat = new Quaternion();

// compose a sampled value with the base pose captured at play-start: quaternions multiply, everything
// else adds componentwise (scalars add directly)
const compose_relative = (track: CompiledTrack, base: number[], value: ChannelValue): ChannelValue => {
    if (track.value_type === "quaternion") {
        base_quat.fromArray(base);
        local_quat.fromArray(value as number[]);
        return base_quat.multiply(local_quat).toArray();
    }

    if (typeof value === "number") {
        return value + (base[0] ?? 0);
    }

    return (value as number[]).map((component, index) => component + (base[index] ?? 0));
};

export const AnimationRunner = () => {
    useFrame(() => {
        const now = performance.now();

        for (const running of get_active_animations()) {
            // released (stopped or finished non-loop) animations hold their target for another writer
            if (running.released) continue;

            const time_ms = sample_time(running, now);

            for (let index = 0; index < running.tracks.length; index++) {
                const track = running.tracks[index]!;

                // resolved every frame rather than cached, so a target that mounts
                // late binds without the animation needing a restart
                const channel = get_animation_channel(track.object_id, track.path);
                if (!channel) continue;

                if (channel.value_type !== track.value_type) continue;

                let value = to_channel_value(track.evaluate(time_ms), track.scalar);

                if (track.relative && channel.get) {
                    // capture the base pose on the first applied frame after a (re)start
                    running.bases[index] ??= channel.get() as number[];
                    const base = running.bases[index];
                    if (base) value = compose_relative(track, base, value);
                }

                channel.set(value);
            }

            // non-looping animations release after the final frame is applied above, so they stop
            // fighting whatever owns the target next instead of pinning the last keyframe forever
            if (!running.loop && time_ms >= running.duration_ms) {
                release_animation(running.id);
                // TODO: emit a finished report through the animation's binding
            }
        }
    }, -2);

    return null;
};
