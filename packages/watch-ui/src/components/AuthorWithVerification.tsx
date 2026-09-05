import { canonicalise_url } from "@hyperlinkvr/auth";
import { useSignatureVerification } from "@hyperlinkvr/react";
import { Container, Text } from "@react-three/uikit";
import { UserCheck } from "@react-three/uikit-lucide";

export const AuthorWithVerification = ({
    author,
    url,
    color = "black"
}: {
    author: {
        username: string;
        signature?: string;
    };
    url: string;
    color?: string;
}) => {
    const signature_valid = useSignatureVerification({
        data: canonicalise_url(url),
        signature: author.signature,
        username: author.username
    });

    return (
        <Container
            flexDirection="row"
            gap={4}
            alignItems="center"
            justifyContent="flex-start"
            color={signature_valid === false ? "red" : color}
        >
            <Text>by</Text>

            <Text fontWeight="bold">
                {author ? author.username : "Unknown author"}
            </Text>

            {signature_valid === true ? (
                <UserCheck marginLeft={2} />
            ) : signature_valid === false ? (
                <Text>{author.signature ? "(invalid signature)" : "(unsigned)"}</Text>
            ) :
                <Text color={author.signature ? "#aaaaaa" : "red"}>{author.signature ? "..." : "(unsigned)"}</Text>
            }
        </Container>
    );
};