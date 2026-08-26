import { useSetting } from "@hyperlinkvr/react";
import { useMemo } from "react";

export const useShadowMapSize = (): number | undefined => {
    const [shadows] = useSetting("shadows_mode");
    return useMemo(() => {
        if (shadows === "soft_low" || shadows === "basic") return 1024;
        if (shadows === "soft_medium") return 2048;
        if (shadows === "soft_high") return 4096;
        return undefined;
    }, [shadows]);
};
