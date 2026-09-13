import { Packr, Unpackr } from "msgpackr";
import type { ClientFrame, Delivery, Payload, SendTarget, ServerFrame } from "@hyperlinkvr/core";

// the wire types are shared with the client engine, so they live in @hyperlinkvr/core; the codec
// stays here (and mirrored on the client) so core needs no msgpackr dependency.
export type { ClientFrame, ServerFrame } from "@hyperlinkvr/core";

const packr = new Packr();
const unpackr = new Unpackr();

export const encode = (frame: ServerFrame): Buffer => packr.pack(frame);

const is_delivery = (v: unknown): v is Delivery => v === "reliable" || v === "unreliable";

const is_payload = (v: unknown): v is Payload =>
    typeof v === "string" || v instanceof Uint8Array;

const is_target = (v: unknown): v is SendTarget => {
    if (v === "others" || v === "host") {
        return true;
    }
    return typeof v === "object" && v !== null && typeof (v as { peer: unknown }).peer === "string";
};

export const parse_client_frame = (data: Uint8Array): ClientFrame | null => {
    let raw: unknown;
    try {
        raw = unpackr.unpack(data as unknown as Buffer);
    } catch {
        return null;
    }

    if (typeof raw !== "object" || raw === null) {
        return null;
    }
    const frame = raw as Record<string, unknown>;

    if (frame.t === "leave") {
        return { t: "leave" };
    }

    if (
        frame.t === "msg" &&
        is_target(frame.target) &&
        typeof frame.channel === "string" &&
        is_delivery(frame.delivery) &&
        is_payload(frame.payload)
    ) {
        return {
            t: "msg",
            target: frame.target,
            channel: frame.channel,
            delivery: frame.delivery,
            payload: frame.payload
        };
    }

    return null;
};
