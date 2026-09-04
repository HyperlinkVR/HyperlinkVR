import { useSignatureVerification, useWorldMetadataWithFallback } from "@hyperlinkvr/react";
import { Container, Text } from "@react-three/uikit";
import { useEffect, useMemo } from "react";



import { FocusableButton } from "../components/FocusableButton";
import { WorldThumbnail } from "../components/WorldThumbnail";
import { useNavState } from "../contexts/NavStateContext";
import type { ScreenProps } from "./index";
import { get_clear_fg_color } from "../util/color";
import { canonicalise_url } from "@hyperlinkvr/auth";
import { UserCheck } from "@react-three/uikit-lucide";
import { useCrossfadeOpacity } from "../animation/Crossfader";

export const WorldScreen = ({args}: ScreenProps) => {
    const {change_title, current} = useNavState();
    const {title, description, thumbnail, author, tags, theme_color} = useWorldMetadataWithFallback(args.url || null);

    useEffect(() => {
        if (current !== "world") {
            return;
        }

        change_title(title);
    }, [title, change_title]);

    const signature_valid = useSignatureVerification({
        data: args.url ? canonicalise_url(args.url) : undefined,
        signature: author?.signature,
        username: author?.username,
    });

    const on_theme_color = useMemo(() => get_clear_fg_color(theme_color || 0xffffff), [theme_color]);

    const opacity = useCrossfadeOpacity();

    return (
        <Container width="100%" height="100%" flexDirection="column" alignItems="center" justifyContent="flex-start" gap={16} color="white">
            <Container flexDirection="row" gap={4} alignItems="center" justifyContent="flex-start" color={signature_valid === false ? "red" : "white"}>
                <Text>
                    by
                </Text>
                <Text fontWeight="bold">{author ? author.username : "Unknown author"}</Text>
                {signature_valid === true ? <UserCheck marginLeft={2} /> : signature_valid === false ? <Text>(signature invalid)</Text> : null}
            </Container>

            <Container width="100%" height="50%" flexDirection="row" alignItems="flex-start" justifyContent="flex-start" gap={16} marginTop={16}>
                <WorldThumbnail
                    thumbnail={thumbnail}
                    height="100%"
                    aspectRatio={16/9}
                />

                <Container flexDirection="column" gap={16} alignItems="flex-start" justifyContent="flex-start" width="60%" height="100%">
                    <Text>
                        {description || "No description provided."}
                    </Text>
                </Container>
            </Container>

            <Container width="100%" flexDirection="row" alignItems="center" justifyContent="flex-start" gap={10}>
                {tags ? (<>
                    <Text fontWeight="bold" marginRight={2}>Tags:</Text>
                    {tags.map((tag) => (
                        <Container key={tag} padding={6} backgroundColor={theme_color || 0xffffff} color={on_theme_color} borderRadius="25%">
                            <Text>#{tag}</Text>
                        </Container>
                    ))}
                </>) : <Text fontWeight="bold">No tags provided.</Text>}
            </Container>

            <Container width="100%" flexDirection="row" alignItems="center" justifyContent="flex-start" gap={10}>
                <Text fontWeight="bold">URL:</Text>
                <Text>{args.url}</Text>
            </Container>

            <Container marginTop="auto" width="100%" height="15%" flexDirection="row" alignItems="center" justifyContent="flex-start" gap={10}>
                <FocusableButton width="100%" height="100%" backgroundColor={theme_color || 0xffffff} opacity={opacity}>
                    <Text fontWeight="bold" color={on_theme_color} fontSize={32}>Join world</Text>
                </FocusableButton>
            </Container>
        </Container>
    );
}
