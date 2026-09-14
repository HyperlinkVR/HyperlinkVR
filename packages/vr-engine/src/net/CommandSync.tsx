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

        set_command_transport({
            is_host: () => room.self.id === room.host(),
            send: (target, payload) => room.send(target, COMMAND_CHANNEL, payload, "reliable"),
        });

        const unlisten = room.on_message((message) => {
            if (message.channel !== COMMAND_CHANNEL) {
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
