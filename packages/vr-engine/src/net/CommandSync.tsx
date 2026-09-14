// binds the live room to the command bus: registers the transport the bus sends through,
// and pumps inbound commands from the host into the local applier. mount it inside the
// session, alongside PresenceSync. mirror of how PresenceSync owns a channel.

import { useEffect } from "react";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { COMMAND_CHANNEL, set_command_transport } from "./command_bus";
import { useNetSession } from "./NetSession";

export const CommandSync = () => {
    const { room } = useNetSession();

    const { apply_remote_command } = useWebSDKMessaging();

    useEffect(() => {
        if (!room) {
            set_command_transport(null);
            return;
        }

        console.debug("[cmd] transport bound", { self: room.self.id, host: room.host(), is_host: room.self.id === room.host() });

        set_command_transport({
            is_host: () => room.self.id === room.host(),
            send: (target, payload) => room.send(target, COMMAND_CHANNEL, payload, "reliable"),
        });

        const unlisten = room.on_message((message) => {
            if (message.channel !== COMMAND_CHANNEL) {
                return;
            }

            // AUTHORITY: only the host authors commands. `from` is stamped server-side and can't
            // be forged, so this drops anything from a non-host peer — a client can't inject state
            // into us, and the host applies nothing inbound (it authors via its page, sends out).
            // legitimate client influence is reports the host's page validates (#14), never this.
            if (message.from !== room.host()) {
                console.warn("[cmd] dropped non-host command", { from: message.from, host: room.host() });
                return;
            }

            const parsed = JSON.parse(message.payload as string);
            apply_remote_command(parsed);
        });

        return () => {
            unlisten();
            set_command_transport(null);
        };
    }, [room, apply_remote_command]);

    return null;
};
