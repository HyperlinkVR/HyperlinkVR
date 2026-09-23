import type { HUDProgressComponent } from "@hyperlinkvr/vr-engine-schemas";
import { Progress } from "@react-three/uikit-default";
import { useMemo } from "react";

export const ProgressComponent = ({component}: {component: HUDProgressComponent}) => {
    const value_percent = useMemo(() => (
        (component.value - component.min) / (component.max - component.min)) * 100,
        [component.value, component.min, component.max]
    );

    return (
        <Progress
            value={value_percent}
            backgroundColor={component.bg_color}
            color={component.fg_color}
            width={component.width}
            height={component.height}
        />
    );
}
