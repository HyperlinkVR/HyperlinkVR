import {useEffect} from "react";
import {AnimationSchema} from "@hyperlinkvr/vr-engine-schemas";

import {useWebSDKMessaging} from "../contexts/WebSDKMessagingContext";
import {register_command_handler} from "../engine/trigger_registry";
import {pause_animation, resume_animation, seek_animation, start_animation, stop_animation} from "./playback";

export const AnimationSync = () => {
    const rtc = useWebSDKMessaging();

    useEffect(() => {
        // binding id to unregister, so a destroy tears down the command handler too
        const command_unlisteners = new Map<string, () => void>();

        const run_command = async (animation_id: string, command: string, args?: any) => {
            const now = performance.now();

            switch (command) {
                case "play":
                    // fired_at from a trigger keeps peers in phase, falling back to now for direct calls
                    resume_animation(animation_id, args?.fired_at ?? now);
                    break;
                case "restart":
                    seek_animation(animation_id, 0, args?.fired_at ?? now);
                    resume_animation(animation_id, args?.fired_at ?? now);
                    break;
                case "pause":
                    pause_animation(animation_id, now);
                    break;
                case "stop":
                    // holds targets where they are, matching how a cancelled tween behaves
                    pause_animation(animation_id, now);
                    seek_animation(animation_id, 0, now);
                    break;
                case "seek":
                    seek_animation(animation_id, args.time_ms, now);
                    break;
                default:
                    return {success: false, error: `Unknown command ${command}`};
            }

            return {success: true};
        };

        const unlisten_create = rtc.on_action("HVRSDK_CREATE_ANIMATION", (message, reply) => {
            const {success, data: animation} = AnimationSchema.safeParse(message.animation);
            if (!success) {
                console.error("Failed to parse animation dispatch", animation);
                reply({success: false, error: "Failed to parse animation dispatch"});
                return;
            }

            const id = crypto.randomUUID();
            const created = {id, ...animation};
            console.log("(+) Creating animation", created);

            // compiled and registered paused at zero, so autoplay is just an immediate resume
            start_animation(id, animation, performance.now());
            if (!animation.autoplay) {
                pause_animation(id, performance.now());
                seek_animation(id, 0, performance.now());
            }

            const binding_id = animation.binding?.id;
            if (binding_id) {
                command_unlisteners.set(id, register_command_handler(
                    binding_id,
                    (command, args) => run_command(id, command, args)
                ));
            }

            reply({for: "HVRSDK_CREATE_ANIMATION", animation: created});
        });

        const unlisten_destroy = rtc.on_action("HVRSDK_DESTROY_ANIMATION", (message, reply) => {
            console.log("(-) Destroying animation", message.animation_id);

            stop_animation(message.animation_id);
            command_unlisteners.get(message.animation_id)?.();
            command_unlisteners.delete(message.animation_id);

            reply({for: "HVRSDK_DESTROY_ANIMATION", animation_id: message.animation_id});
        });

        const unlisten_command = rtc.on_action("HVRSDK_ANIMATION_COMMAND", async (message, reply) => {
            reply({
                for: "HVRSDK_ANIMATION_COMMAND",
                result: await run_command(message.animation_id, message.command, message.args)
            });
        });

        return () => {
            unlisten_create();
            unlisten_destroy();
            unlisten_command();
            for (const unlisten of command_unlisteners.values()) unlisten();
            command_unlisteners.clear();
        };
    }, [rtc]);

    return null;
};
