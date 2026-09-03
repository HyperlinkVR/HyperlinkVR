import { useWorldMetadataWithFallback } from "@hyperlinkvr/react";
import { Container, Image, Text } from "@react-three/uikit";
import { ImageOff } from "@react-three/uikit-lucide";
import { ellipsis_truncate } from "../util/text";


import { FocusableButton } from "./FocusableButton";
import { WorldThumbnail } from "./WorldThumbnail";


export type WorldCardProps = {
    url: string;
    on_press?: () => void;
};

const CARD_WIDTH = 250;
const CARD_HEIGHT = 200;

export const WorldCard = ({ url, on_press }: WorldCardProps) => {
    const { title, author, description, thumbnail } = useWorldMetadataWithFallback(url);
    // TODO: handle with asset url privacy (might need to become its own package, then could also forcibly wrap the metadata thumbnail url in a ref)

    // TODO: signature verification for checkmark

    return (
        <FocusableButton
            variant="link"
            padding={0}
            height={CARD_HEIGHT}
            width={CARD_WIDTH}
            flexShrink={0}
            flexDirection="column"
            alignItems="center"
            borderRadius={8}
            backgroundColor="#ffffff"
            overflow="hidden"
            on_press={on_press}
        >
            <WorldThumbnail
                thumbnail={thumbnail}
                width="100%"
                height="60%"
                borderTopRadius={8}
            />

            <Container flexDirection="column" gap={2} padding={8} alignItems="flex-start" justifyContent="flex-start" width="100%" height="40%">
                <Text fontWeight="bold" fontSize={14} color="black">
                    {title ?? url}
                </Text>

                <Text fontSize={11} color="#666666">
                    {author ? author.username : "Unknown author"}
                </Text>

                <Text fontSize={11} color="#444444" maxHeight={28} overflow="hidden">
                    {description ? ellipsis_truncate(description, 50) : "No description provided."}
                </Text>
            </Container>
        </FocusableButton>
    );
};
