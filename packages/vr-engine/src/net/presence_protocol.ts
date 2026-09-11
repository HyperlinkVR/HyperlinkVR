import type { StoredAvatar } from "../contexts/AvatarContext";

// TODO: binary encoding once the shape settles

export const POSE_CHANNEL = "presence.pose";
export const APPEARANCE_CHANNEL = "presence.appearance";

// position then quaternion, world space
export type PoseTuple = [number, number, number, number, number, number, number];

// grip pose then curl
export type HandTuple = [number, number, number, number, number, number, number, number];

export interface PoseMessage {
    // sender's clock, only comparable with that sender's other messages
    t: number;
    head: PoseTuple;
    left: HandTuple | null;
    right: HandTuple | null;
}

export interface Appearance {
    avatar: StoredAvatar;
    height_cm: number;
}

export interface AppearanceMessage {
    appearance: Appearance;
    // set when announcing, asking everyone to answer with theirs
    want_reply: boolean;
}

const round = (value: number) => Math.round(value * 10000) / 10000;

export const encode_pose = (message: PoseMessage): string =>
    JSON.stringify({
        t: Math.round(message.t),
        head: message.head.map(round),
        left: message.left?.map(round) ?? null,
        right: message.right?.map(round) ?? null
    });

export const decode_pose = (payload: string): PoseMessage | null => {
    try {
        const message = JSON.parse(payload) as PoseMessage;
        if (typeof message.t !== "number" || !Array.isArray(message.head) || message.head.length !== 7) {
            return null;
        }
        return message;
    } catch {
        return null;
    }
};

export const decode_appearance = (payload: string): AppearanceMessage | null => {
    try {
        const message = JSON.parse(payload) as AppearanceMessage;
        if (!message.appearance?.avatar || typeof message.appearance.height_cm !== "number") {
            return null;
        }
        return message;
    } catch {
        return null;
    }
};
