import { read_auth_session } from "@hyperlinkvr/auth";
import type { Handler } from "./types";

export const query: Handler<"HVRSDK_AUTH_QUERY"> = async ({ message }) => {
    // TODO: ask the vr host if the person is in the room and who they are, for now this is just a parrot as we dont have much public auth info anyway
    // could use a public key store for users in lobby to make this lookup super fast. ideall we dont download it from the server under any circumstance (TODO: can we trust user provided pub key? prob not but then need to reach out to fed domain)
    // TODO: should this also be deferred
    return {
        for: "HVRSDK_AUTH_QUERY",
        info: {
            identity: message.identity,
            public_key: {},
            avatar_url: undefined
        }
    };
};

export const whoami: Handler<"HVRSDK_AUTH_WHOAMI"> = async ({ storage }) => {
    const auth_session = await read_auth_session(storage.local);
    if (!auth_session) {
        return {
            for: "HVRSDK_AUTH_WHOAMI",
            info: null
        }
    }

    return {
        for: "HVRSDK_AUTH_WHOAMI",
        info: {
            uuid: auth_session.uuid,
            identity: auth_session.identity,
            public_key: auth_session.public_key,
            avatar_url: auth_session.avatar_url,
            authed_at: auth_session.authed_at
        }
    }
}
