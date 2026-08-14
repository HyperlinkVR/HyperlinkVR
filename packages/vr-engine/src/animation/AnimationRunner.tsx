import {useFrame} from "@react-three/fiber";
import {get_animation_channel, type ChannelValue} from "./channel_registry";
import {get_active_animations, sample_time} from "./playback";

const to_channel_value = (buffer: ArrayLike<number | boolean | string>, scalar: boolean): ChannelValue =>
    scalar ? (buffer[0] as ChannelValue) : (Array.from(buffer) as number[]);

export const AnimationRunner = () => {
    useFrame(() => {
        const now = performance.now();

        for (const running of get_active_animations()) {
            const time_ms = sample_time(running, now);

            for (const track of running.tracks) {
                // resolved every frame rather than cached, so a target that mounts
                // late binds without the animation needing a restart
                const channel = get_animation_channel(track.object_id, track.path);
                if (!channel) continue;

                if (channel.value_type !== track.value_type) continue;

                channel.set(to_channel_value(track.evaluate(time_ms), track.scalar));
            }

            if (!running.loop && !running.finished && time_ms >= running.duration_ms) {
                running.finished = true;
                // TODO: emit a finished report through the animation's binding
            }
        }
    }, -2);

    return null;
};
