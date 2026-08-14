import type {KeyframeType} from "@hyperlinkvr/vr-engine-schemas";

export type ChannelValue = number | boolean | string | number[];

export interface AnimationChannel {
    value_type: KeyframeType;
    set: (value: ChannelValue) => void;
}

type ObjectChannels = Map<string, AnimationChannel>;
const channels_by_object = new Map<string, ObjectChannels>();

const entry_for = (object_id: string): ObjectChannels => {
    let entry = channels_by_object.get(object_id);
    if (!entry) {
        entry = new Map();
        channels_by_object.set(object_id, entry);
    }
    return entry;
};

export const register_animation_channels = (object_id: string, channels: Record<string, AnimationChannel>) => {
    const entry = entry_for(object_id);
    const names = Object.keys(channels);

    for (const name of names) {
        entry.set(name, channels[name]);
    }

    return () => {
        const current = channels_by_object.get(object_id);
        if (!current) return;

        for (const name of names) {
            if (current.get(name) === channels[name]) {
                current.delete(name);
            }
        }

        if (current.size === 0) {
            channels_by_object.delete(object_id);
        }
    };
};

export const get_animation_channel = (object_id: string, path: string) =>
    channels_by_object.get(object_id)?.get(path);
export const list_animation_channels = (object_id: string) =>
    [...(channels_by_object.get(object_id)?.keys() ?? [])];
