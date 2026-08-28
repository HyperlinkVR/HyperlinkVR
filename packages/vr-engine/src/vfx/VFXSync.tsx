import { useEffect } from "react";

import { VFXStackSchema } from "@hyperlinkvr/vr-engine-schemas";

import { run_command } from "../engine/trigger_registry";
import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { useVFXStore } from "../stores/VFXStore";

export const VFXSync = () => {
    const rtc = useWebSDKMessaging();

    useEffect(() => {
        const unlisten_set = rtc.on_action("HVRSDK_SET_VFX", (message, reply) => {
            const { success, data } = VFXStackSchema.safeParse(message.stack);
            if (!success) {
                console.error("Invalid VFX stack", data);
                reply({
                    for: "HVRSDK_SET_VFX",
                    success: false,
                    error: "Invalid VFX stack"
                });
                return;
            }

            useVFXStore.getState().set_stack(data);
            console.log("(+) Set VFX stack", data);

            reply({
                for: "HVRSDK_SET_VFX",
                success: true
            });
        });

        const unlisten_command = rtc.on_action("HVRSDK_VFX_COMMAND", async (message, reply) => {
            try {
                const response = await run_command(message.binding_id, message.command, message.args);
                reply({
                    for: "HVRSDK_VFX_COMMAND",
                    success: true,
                    response
                });
            } catch (error) {
                console.error("VFX command threw", error);
                reply({
                    for: "HVRSDK_VFX_COMMAND",
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });

        return () => {
            unlisten_set();
            unlisten_command();
        };
    }, [rtc]);

    return null;
};
