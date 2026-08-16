import {useEffect} from "react";

import {useWebSDKMessaging} from "../contexts/WebSDKMessagingContext";
import {useHUDStore} from "../stores/HUDStore";
import {
    CreatedHUDElementSchema,
    HUDDispatchSchema,
    HUDElementModificationSchema, safe_parse_and_adopt
} from "@hyperlinkvr/vr-engine-schemas";
import {
    clear_hud_element_ready,
    wait_for_hud_element_ready
} from "../engine/hud_ready_registry"; // TODO: reorganise stuff in engine/
import {list_animation_channels} from "../animation/channel_registry";

export const HUDSync = () => {
    const rtc = useWebSDKMessaging();

    useEffect(() => {
        const unlisten_create = rtc.on_action("HVRSDK_CREATE_HUD_ELEMENT", (message, reply) => {
            const {add_element, resolve_for} = useHUDStore.getState();

            const {success, data} = safe_parse_and_adopt(HUDDispatchSchema, message.element);
            if (!success) {
                console.error("Failed to parse HUD element dispatch", data);
                reply({success: false, error: "Failed to parse HUD element dispatch"});
                return;
            }

            const id = crypto.randomUUID();
            const created = CreatedHUDElementSchema.parse({id, ...data});
            console.log("(+) Creating HUD element", created);
            add_element(created);

            // an element scoped away from the local player renders on no surface, so nothing will ever mark it ready (reply straight away to prevent hang)
            const renders_locally = resolve_for(null, null).some((element) => element.id === id);
            if (!renders_locally) {
                reply({
                    for: "HVRSDK_CREATE_HUD_ELEMENT",
                    element: created,
                    channels: []
                });
                return;
            }

            wait_for_hud_element_ready(id).then(() => {
                console.log("(*) HUD element ready", id);

                reply({
                    for: "HVRSDK_CREATE_HUD_ELEMENT",
                    element: created,
                    channels: list_animation_channels(id)
                });
            });
        });

        const unlisten_destroy = rtc.on_action("HVRSDK_DESTROY_HUD_ELEMENT", (message, reply) => {
            const {remove_element} = useHUDStore.getState();

            console.log("(-) Destroyed HUD element", message.element_id);
            remove_element(message.element_id);
            clear_hud_element_ready(message.element_id);

            reply({
                for: "HVRSDK_DESTROY_HUD_ELEMENT",
                element_id: message.element_id
            });
        });

        const unlisten_update = rtc.on_action("HVRSDK_UPDATE_HUD_ELEMENT", (message, reply) => {
            const {get_element, modify_element} = useHUDStore.getState();

            const stored = get_element(message.element_id);
            if (!stored) {
                reply({success: false, error: "No such HUD element"});
                return;
            }

            const {success, data} = safe_parse_and_adopt(HUDElementModificationSchema, message.changes);
            if (!success) {
                console.error("Failed to parse HUD element modification", data);
                reply({success: false, error: "Failed to parse HUD element modification"});
                return;
            }

            // TODO: message.tween is applied instantly for now. tween_registry is keyed by object id and only interpolates transforms (will be best to move tweens to use channel system)
            modify_element(message.element_id, data, message.target_username);

            reply({
                for: "HVRSDK_UPDATE_HUD_ELEMENT",
                element_id: message.element_id,
                success: true
            });
        });

        const unlisten_reset = rtc.on_action("HVRSDK_RESET_HUD", (message, reply) => {
            const {reset} = useHUDStore.getState();

            console.log("(x) Reset HUD", message.target_username ?? "for everyone");
            reset(message.target_username);

            reply({
                for: "HVRSDK_RESET_HUD",
                success: true
            });
        });

        return () => {
            unlisten_create();
            unlisten_destroy();
            unlisten_update();
            unlisten_reset();
        };
    }, [rtc]);

    return null;
};
