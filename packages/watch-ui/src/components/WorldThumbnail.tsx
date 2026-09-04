import { Container, Image } from "@react-three/uikit";
import { ImageOff } from "@react-three/uikit-lucide";

interface WorldThumbnailProps {
    thumbnail?: string | null;
    container_props?: React.ComponentProps<typeof Container>;
    image_props?: React.ComponentProps<typeof Image>;
}

export const WorldThumbnail = ({thumbnail, container_props, image_props}: WorldThumbnailProps) => (
    <Container
        backgroundColor={thumbnail ? "transparent" : "#e5e5e5"}
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        {...container_props}
    >
        {thumbnail ? (
            <Image
                src={thumbnail}
                {...image_props}
            />
        ) : (
            <ImageOff color="#999999" width={32} height={32} />
        )}
    </Container>
);
