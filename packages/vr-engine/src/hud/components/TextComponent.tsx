import type { HUDTextComponent } from "@hyperlinkvr/vr-engine-schemas";
import { Text } from "@react-three/uikit";

export const TextComponent = ({component}: {component: HUDTextComponent}) => (
    <Text
        fontSize={component.font_size}
        color={component.color}
    >
        {component.text}
    </Text>
);
