import { verify_from_username } from "@hyperlinkvr/auth";
import { useEffect, useState } from "react";



import { useStorageEngine } from "../contexts";


interface UseSignatureVerificationProps {
    username?: string;
    signature?: string;
    data?: string;
}

export const useSignatureVerification = (props: UseSignatureVerificationProps | null) => {
    const local_storage = useStorageEngine("local");
    const [signature_valid, setSignatureValid] = useState<boolean | null>(null);

    const username = props?.username;
    const signature = props?.signature;
    const data = props?.data;

    useEffect(() => {
        setSignatureValid(null);
        let cancelled = false;

        (async () => {
            if (!username || !signature || !data) {
                setSignatureValid(null);
                return;
            }

            try {
                const valid = await verify_from_username(
                    data,
                    signature,
                    username,
                    local_storage
                );

                if (!cancelled) setSignatureValid(valid);
            } catch (e) {
                console.error("Failed to verify signature:", e);
                if (!cancelled) setSignatureValid(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [username, signature, data, local_storage]);

    return signature_valid;
}
