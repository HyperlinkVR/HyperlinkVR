import { useEffect } from "react";

import { mark_hud_element_ready } from "../hud_ready_registry";
import type { ResolvedHUDElement as StoreResolvedHUDElement } from "../../stores/HUDStore";
import { TextComponent } from "./TextComponent";
import { ProgressComponent } from "./ProgressComponent";


export const HUDComponentView = ({element}: {element: StoreResolvedHUDElement}) => {
    useEffect(() => {
        mark_hud_element_ready(element.id);
    }, [element.id]);

    // TODO: replace this with calls to imported components when more are added for cleanliness, since text is just a test it can be inlined

    switch (element.component.type) {
        case "text":
            return <TextComponent component={element.component} />;
        case "progress":
            return <ProgressComponent component={element.component} />;
        default:
            return null;
    }
}
