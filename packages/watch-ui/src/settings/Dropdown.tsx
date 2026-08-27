import { Container, Text } from "@react-three/uikit";
import { ChevronDown, ChevronUp } from "@react-three/uikit-lucide";
import type {ComponentRef} from "react";
import { useCallback, useEffect, useRef, useState} from "react";
import {useCrossfadeOpacity} from "../animation/Crossfader";
import {useFocusable} from "../contexts/FocusNavContext";

export interface Option {
    label: string;
    value: string | number;
}

interface DropdownProps {
    label?: string;
    value: string | number;
    options: Option[];
    on_change: (value: string | number) => void;
    disabled?: boolean;
}

const Option = ({
    opt,
    value,
    on_change,
    close
}: {
    opt: Option;
    value: string | number;
    on_change: (value: string | number) => void;
    close: () => void;
}) => {
    const ref = useRef<ComponentRef<typeof Container>>(null);
    const {is_focused, grab_focus} = useFocusable(ref, {
        on_accept: () => {
            on_change(opt.value);
            close();
        },
        on_cancel: () => {
            close();
            return true
        }
    });

    // become focused on open if this is the currently selected option
    useEffect(() => {
        if (opt.value === value) {
            grab_focus();
        }
    }, [grab_focus, opt.value, value]);

    return (
        <Container
            ref={ref}
            key={opt.value}
            paddingX={8}
            paddingY={6}
            borderRadius={4}
            cursor="pointer"
            backgroundColor={opt.value === value ? "#475569" : "transparent"}
            onClick={(e) => {
                e.stopPropagation();
                on_change(opt.value);
                close();
            }}
            hover={{ backgroundColor: "#475569" }}

            borderWidth={is_focused ? 1 : 0}
            borderColor={is_focused ? "white" : "transparent"}
        >
            <Text fontSize={14} color="white">
                {opt.label}
            </Text>
        </Container>
    );
}

export const Dropdown = ({
    label = "",
    value,
    options,
    on_change,
    disabled = false
}: DropdownProps) => {
    const [is_open, setIsOpen] = useState(false);

    const active_option = options.find((opt) => opt.value === value) || options[0];

    const opacity = useCrossfadeOpacity();

    const ref = useRef<ComponentRef<typeof Container>>(null);
    const {is_focused, grab_focus} = useFocusable(ref, {
        on_accept: () => setIsOpen(true),
    });

    const close = useCallback(
        () => {
            setIsOpen(false);
            grab_focus();
        },
        [grab_focus]
    );

    return (
        <Container
            ref={ref}
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
            width="100%"
            maxWidth={384}
            paddingY={8}
            opacity={disabled ? opacity/2 : opacity}
        >
            {label && (
                <Text fontSize={12} flexWrap="no-wrap" marginRight={16} color="white">
                    {label}
                </Text>
            )}

            <Container positionType="relative" minWidth={120} flexShrink={0}>
                <Container
                    flexDirection="row"
                    alignItems="center"
                    justifyContent="space-between"
                    backgroundColor="#334155"
                    paddingX={12}
                    paddingY={8}
                    borderRadius={6}
                    cursor={disabled ? "default" : "pointer"}
                    onClick={(e) => {
                        if (disabled) return;
                        e.stopPropagation();

                        if (is_open) {
                            close();
                        } else {
                            setIsOpen(true);
                        }
                    }}
                    hover={{
                        backgroundColor: disabled ? "#334155" : "#475569"
                    }}

                    borderWidth={is_focused ? 1 : 0}
                    borderColor={is_focused ? "white" : "transparent"}
                >
                    <Text
                        fontSize={14}
                        color="white"
                        marginRight={16}>
                        {active_option?.label || "Select..."}
                    </Text>

                    <Container marginTop={2}>
                        {is_open ? (
                            <ChevronUp width={14} height={14} color="#cbd5e1" />
                        ) : (
                            <ChevronDown width={14} height={14} color="#cbd5e1" />
                        )}
                    </Container>
                </Container>

                {is_open && (
                    // TODO: use portal or be on top layer
                    // first container catches clicks outside the dropdown to close it, second container is the actual dropdown menu
                    <>
                        <Container
                            positionType="absolute"
                            positionTop={-5000}
                            positionBottom={-5000}
                            positionLeft={-5000}
                            positionRight={-5000}
                            zIndexOffset={10}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                            }}
                        />

                        <Container
                            positionType="absolute"
                            positionTop={40}
                            positionLeft={0}
                            positionRight={0}
                            backgroundColor="#1e293b"
                            borderRadius={6}
                            padding={4}
                            zIndexOffset={20}
                            flexDirection="column"
                            gap={2}
                        >
                            {options.map((opt) => (
                                <Option
                                    key={opt.value}
                                    opt={opt}
                                    value={value}
                                    on_change={on_change}
                                    close={close}
                                />
                            ))}
                        </Container>
                    </>
                )}
            </Container>
        </Container>
    );
};
