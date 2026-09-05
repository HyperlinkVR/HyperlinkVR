import { Container, Input, VanillaInput } from "@react-three/uikit";
import { Search, X } from "@react-three/uikit-lucide";
import { useImperativeHandle, useRef } from "react";
import { FocusableButton } from "./FocusableButton";


export const SearchBar = ({
    ref = null,
    value,
    on_change,
    on_focus_change
}: {
    ref?: React.RefObject<VanillaInput | null> | null,
    value?: string,
    on_change?: (value: string) => void,
    on_focus_change?: (is_focused: boolean) => void
}) => {
    const internal_ref = useRef<VanillaInput>(null);
    useImperativeHandle(ref, () => internal_ref.current!, [internal_ref]);

    return (
        <Container width="100%" height={48} borderRadius={4} paddingInline={16} backgroundColor="#ffffff" flexDirection="row" alignItems="center" justifyContent="center" gap={16}>
            <Search />
            <Input ref={internal_ref} width="100%" placeholder="Search worlds..." paddingBlock={24} value={value} onFocusChange={on_focus_change} onValueChange={on_change} />
            {value && (
                <FocusableButton variant="link" on_press={() => on_change?.("")} color="black">
                    <X />
                </FocusableButton>
            )}
        </Container>
    );
}
