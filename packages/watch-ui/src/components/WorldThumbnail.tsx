import { Container, Image } from "@react-three/uikit";
import { ImageOff } from "@react-three/uikit-lucide";

interface WorldThumbnailProps extends React.ComponentProps<typeof Container> {
    thumbnail?: string | null;
}

export const WorldThumbnail = ({thumbnail, ...rest}: WorldThumbnailProps) => (
    <Container
        backgroundColor="#e5e5e5"
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        {...rest}
    >
        {thumbnail ? (
            <Image
                src={thumbnail}
                width="100%"
                height="100%"
                objectFit="cover"
            />
        ) : (
            <ImageOff color="#999999" width={32} height={32} />
        )}
    </Container>
);
