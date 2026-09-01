import { SeekConfigSchema } from "@hyperlinkvr/vr-engine-schemas";
import { useEffect } from "react";
import { Vector3 } from "three";

import { useWebSDKMessaging } from "../contexts/WebSDKMessagingContext";
import { get_object_refs } from "../engine/object_ref_registry";
import { cancel_active_seek, set_active_seek } from "./seek_registry";
import { cancel_active_tween } from "./tween_registry";

const DYNAMIC_BODY = 0;

export const SeekSync = () => {
    const rtc = useWebSDKMessaging();

    useEffect(() => {
        const unlisten_seek = rtc.on_action("HVRSDK_SEEK_ENGINE_OBJECT", (message, reply) => {
            const config = SeekConfigSchema.safeParse(message.config);
            if (!config.success) {
                reply({ for: "HVRSDK_SEEK_ENGINE_OBJECT", error: "Failed to parse seek config" });
                return;
            }

            const refs = get_object_refs(message.object_id)?.current;
            if (!refs) {
                reply({ for: "HVRSDK_SEEK_ENGINE_OBJECT", error: `No object found with id ${message.object_id}` });
                return;
            }

            const body = refs.rigid_body.current;
            if (config.data.mode === "dynamic" && (!body || body.bodyType() !== DYNAMIC_BODY)) {
                reply({
                    for: "HVRSDK_SEEK_ENGINE_OBJECT",
                    error: "Dynamic seek requires the object to have a dynamic rigid body"
                });
                return;
            }

            // dont allow tweens and seeks to be active at the same time, since they both control the same transform
            cancel_active_tween(message.object_id);

            set_active_seek({
                ...config.data,
                id: message.object_id,
                est_vel: new Vector3()
            });

            reply({ for: "HVRSDK_SEEK_ENGINE_OBJECT", object_id: message.object_id, success: true });
        });

        const unlisten_stop = rtc.on_action("HVRSDK_STOP_SEEK_ENGINE_OBJECT", (message, reply) => {
            cancel_active_seek(message.object_id);
            reply({ for: "HVRSDK_STOP_SEEK_ENGINE_OBJECT", object_id: message.object_id, success: true });
        });

        return () => {
            unlisten_seek();
            unlisten_stop();
        };
    }, [rtc]);

    return null;
};
