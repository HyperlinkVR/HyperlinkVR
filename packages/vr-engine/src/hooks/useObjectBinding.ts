import type { BindingConfig, ReportEvent } from "@hyperlinkvr/vr-engine-schemas";
import {useCallback, useEffect, useRef} from "react";

import {useObjectRefsOptional} from "../contexts/ObjectRefsContext";
import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import {fire_triggers, publish_reports} from "../engine/report_outbox";
import {register_command_handler} from "../engine/trigger_registry";
import type {AnimationChannel} from "../animation/channel_registry";
import { register_animation_channels} from "../animation/channel_registry";

type ReportBody = Pick<ReportEvent, "kind" | "payload">;

export const useObjectBinding = (binding: BindingConfig | undefined) => {
    const { on_action } = useWebSDKMessaging();

    const obj_refs = useObjectRefsOptional();
    const object_id = obj_refs?.id;

    useEffect(() => {
        if (!object_id) {
            console.warn("useObjectBinding: object_id is undefined. Make sure this hook is used within an ObjectRefsProvider to enable bindings");
        }
    }, [object_id]);

    const source_id = binding?.id;

    const emit_report = useCallback(
        (body: ReportBody) => {
            if (!source_id || !object_id) {
                return;
            }

            // run triggers regardless of if anything is listening
            fire_triggers(source_id, object_id, body.payload);

            publish_reports([
                {
                    source_id,
                    object_id,
                    ts: performance.now(),
                    ...body
                } as ReportEvent
            ]);
        },
        [source_id, object_id]
    );

    const interaction_command_callback = useRef<(command: string, args?: any) => Promise<any> | null>(null);

    const on_interaction_command = useCallback((callback: (command: string, args?: any) => Promise<any> | null) => {
        interaction_command_callback.current = callback;

        const unregister = source_id ? register_command_handler(source_id, callback) : () => {};

        return () => {
            unregister();
            if (interaction_command_callback.current === callback) {
                interaction_command_callback.current = null;
            }
        }
    }, [source_id]);

    const prefab_command_callback = useRef<(command: string, args?: any) => Promise<any> | null>(null);

    const on_prefab_command = useCallback((callback: (command: string, args?: any) => Promise<any> | null) => {
        prefab_command_callback.current = callback;

        const unregister = source_id ? register_command_handler(source_id, callback) : () => {};

        return () => {
            unregister();
            if (prefab_command_callback.current === callback) {
                prefab_command_callback.current = null;
            }
        }
    }, [source_id]);

    // listen for interaction commands tied to the interaction id
    useEffect(() => {
        if (!source_id || !object_id || !on_action) {
            return;
        }

        const unlisten = on_action("HVRSDK_INTERACTION_COMMAND", async (data, reply) => {
            if (data.object_id !== object_id || data.interaction_id !== source_id) {
                return;
            }

            if (interaction_command_callback.current) {
                let response;
                try {
                    response = await interaction_command_callback.current(data.command, data.args);
                } catch (error) {
                    console.error("Error handling interaction command:", error);
                    response = {error: error instanceof Error ? error.message : String(error)};
                }

                reply({
                    for: "HVRSDK_INTERACTION_COMMAND",
                    object_id: data.object_id,
                    interaction_id: data.interaction_id,
                    response
                });
            }
        });

        return () => {
            unlisten();
        };
    }, [object_id, source_id, on_action]);

    // listen for prefab commands tied to the object id
    useEffect(() => {
        if (!object_id || !on_action) {
            return;
        }

        const unlisten = on_action("HVRSDK_PREFAB_COMMAND", async (data, reply) => {
            if (data.object_id !== object_id) {
                return;
            }

            if (prefab_command_callback.current) {
                let response;
                try {
                    response = await prefab_command_callback.current(data.command, data.args);
                } catch (error) {
                    console.error("Error handling prefab command:", error);
                    response = {error: error instanceof Error ? error.message : String(error)};
                }

                reply({
                    for: "HVRSDK_PREFAB_COMMAND",
                    object_id: data.object_id,
                    response
                });
            }
        });

        return () => {
            unlisten();
        };
    }, [object_id, on_action]);

    const register_channels = useCallback((channels: Record<string, AnimationChannel>) => {
        if (!binding?.id || !object_id) return () => {};

        const prefixed = Object.fromEntries(
            Object.entries(channels).map(([name, channel]) => [`interactions.${binding.id}.${name}`, channel])
        );

        return register_animation_channels(object_id, prefixed);
    }, [binding?.id, object_id]);

    return {
        emit_report,
        on_interaction_command,
        on_prefab_command,
        register_channels
    };
};
