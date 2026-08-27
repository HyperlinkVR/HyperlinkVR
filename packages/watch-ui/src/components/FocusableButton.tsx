import type {ComponentProps, ComponentRef} from "react";
import { useImperativeHandle, useRef} from "react";
import {Button} from "@react-three/uikit-default";
import type { UseFocusableNeighboursOptions} from "../contexts/FocusNavContext";
import {useFocusable} from "../contexts/FocusNavContext";

type FocusableButtonProps = Omit<ComponentProps<typeof Button>, "onPointerDown" | "onClick"> & {
    neighbours?: UseFocusableNeighboursOptions;
    on_press?: () => void;
};

type ButtonRef = ComponentRef<typeof Button>;

export const FocusableButton = (props: FocusableButtonProps) => {
    const {ref, neighbours, on_press, borderColor, borderWidth, ...rest} = props;

    const internal_ref = useRef<ButtonRef>(null);
    useImperativeHandle(ref, () => internal_ref.current as ButtonRef, [internal_ref]);

    const {is_focused} = useFocusable(internal_ref, {on_accept: on_press}, neighbours);
    const border_color = is_focused ? "white" : borderColor || "transparent";
    const border_width = is_focused ? 1 : borderWidth || 0;

    return (
        <Button
            ref={internal_ref}
            onPointerDown={on_press}
            borderWidth={border_width}
            borderColor={border_color}
            {...rest}
        />
    );
}
