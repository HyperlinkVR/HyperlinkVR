import { Container, Text } from "@react-three/uikit";



import { CARD_HEIGHT, WorldCard } from "./WorldCard";


export type WorldCarouselProps = {
    worlds: string[];
    title?: string;
    on_select?: (url: string) => void;
};

export const WorldCarousel = ({ worlds, title, on_select }: WorldCarouselProps) => {
    return (
        <Container width="100%" flexDirection="column" gap={8} flexShrink={0}>
            {title ? <Text fontWeight="bold" color="white">{title}</Text> : null}

            <Container
                width="100%"
                flexDirection="row"
                gap={12}
                paddingBottom={8}
                overflow="scroll"
                scrollbarWidth={6}
                scrollbarColor="rgba(255, 255, 255, 0.35)"
                scrollbarBorderRadius={3}
                height={CARD_HEIGHT + 8}
            >
                {worlds.map((url) => (
                    <WorldCard key={url} url={url} on_press={() => on_select?.(url)} />
                ))}
            </Container>
        </Container>
    );
};
