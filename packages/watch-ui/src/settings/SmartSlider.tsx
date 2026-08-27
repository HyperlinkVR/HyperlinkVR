import type { ThreeEvent } from "@react-three/fiber";
import { Container, Input, Text } from "@react-three/uikit";
import { useEffect, useRef, useState } from "react";
import {useCrossfadeOpacity} from "../animation/Crossfader";


interface RawDraggableTrackProps {
    value: number;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    onValueChange: (value: number) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

// pmndrs slider broken
// https://github.com/pmndrs/uikit/issues/247
// replace with uikit slider when fixed for maintainability

const RawDraggableTrack = ({
    value,
    min,
    max,
    step,
    disabled = false,
    onValueChange,
    onDragStart,
    onDragEnd
}: RawDraggableTrackProps) => {
    const is_dragging_ref = useRef(false);

    const handle_pointer_event = (e: ThreeEvent<PointerEvent>) => {
        if (disabled || !e.uv) return;

        const percentage = e.uv.x;
        const raw_value = min + percentage * (max - min);

        const snapped_value = Math.round((raw_value - min) / step) * step + min;
        const clamped_value = Math.max(min, Math.min(max, snapped_value));

        onValueChange(clamped_value);
    };

    const progress_pct = Math.max(0, Math.min(1, (value - min) / (max - min))) * 100;

    const opacity = useCrossfadeOpacity();

    return (
        <Container
            width="100%"
            maxWidth={200}
            height={24}
            flexDirection="row"
            alignItems="center"
            opacity={disabled ? opacity/2 : opacity}
        >
            <Container width="100%" height={4} backgroundColor="#475569" borderRadius={2} />

            <Container
                positionType="absolute"
                width={`${progress_pct}%`}
                height={4}
                backgroundColor="white"
                borderRadius={2}
            />

            <Container
                positionType="absolute"
                positionLeft={`${progress_pct}%`}
                marginLeft={-8}
                width={16}
                height={16}
                backgroundColor="white"
                borderRadius={8}
            />

            {/* invisble hitbox that catches rays, rather than the feedback loop of the thumb moving in vr */}
            <Container
                positionType="absolute"
                width="100%"
                height="100%"
                zIndexOffset={10}
                cursor={disabled ? "default" : "pointer"}
                onPointerDown={(e) => {
                    if (disabled) return;
                    e.stopPropagation();
                    is_dragging_ref.current = true;
                    onDragStart?.();

                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    //handle_pointer_event(e); snaps to 0 with touch pointers if enabled! no harm disabling really, other than cant click to place cleanly
                }}
                onPointerMove={(e) => {
                    if (!is_dragging_ref.current) return;
                    e.stopPropagation();
                    handle_pointer_event(e);
                }}
                onPointerUp={(e) => {
                    if (is_dragging_ref.current) {
                        is_dragging_ref.current = false;
                        onDragEnd?.();
                    }
                    e.stopPropagation();
                    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
                        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    }
                }}
                onPointerCancel={(e) => {
                    if (is_dragging_ref.current) {
                        is_dragging_ref.current = false;
                        onDragEnd?.();
                    }
                    e.stopPropagation();
                    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
                        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                    }
                }}
            />
        </Container>
    );
};


interface SmartSliderProps {
    label?: string;
    value: number;
    on_change: (value: number) => void;
    slider_min?: number;
    slider_max?: number;
    min: number;
    max: number;
    step?: number;
    precision_dp?: number;
    unit?: string;
    disabled?: boolean;
}

export const SmartSlider = ({
    label = "",
    value,
    on_change,
    min,
    max,
    slider_min = min,
    slider_max = max,
    step = 1,
    precision_dp = 2,
    unit = "",
    disabled = false
}: SmartSliderProps) => {
    const [input_str, setInputStr] = useState(value.toFixed(precision_dp));
    const [is_focused, setIsFocused] = useState(false);

    const is_dragging_ref = useRef(false);

    const opacity = useCrossfadeOpacity();

    useEffect(() => {
        if (!is_focused && !is_dragging_ref.current) {
            setInputStr(value.toFixed(precision_dp));
        }
    }, [value, precision_dp, is_focused]);

    const handle_slider_change = (new_val: number) => {
        on_change(new_val);
        if (!is_focused) {
            setInputStr(new_val.toFixed(precision_dp));
        }
    };

    const handle_text_change = (val: string) => {
        setInputStr(val);
        const num_val = parseFloat(val);
        if (!isNaN(num_val)) {
            on_change(Math.max(min, Math.min(max, num_val)));
        }
    };

    const handle_blur = () => {
        setIsFocused(false);
        let num_val = parseFloat(input_str);
        if (isNaN(num_val)) num_val = value;

        const final_val = Math.max(min, Math.min(max, num_val));
        on_change(final_val);
        setInputStr(final_val.toFixed(precision_dp));
    };

    return (
        <Container
            flexDirection="row"
            alignItems="flex-start"
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

            <Container
                flexDirection="row"
                flexWrap="wrap"
                alignItems="center"
                justifyContent="flex-end"
                gap={16}
                marginTop={8}
            >
                <RawDraggableTrack
                    value={Math.max(slider_min, Math.min(slider_max, value))}
                    min={slider_min}
                    max={slider_max}
                    step={step}
                    disabled={disabled}
                    onValueChange={handle_slider_change}
                    onDragStart={() => { is_dragging_ref.current = true; }}
                    onDragEnd={() => { is_dragging_ref.current = false; }}
                />

                <Container
                    flexDirection="row"
                    alignItems="center"
                    backgroundColor="#334155"
                    paddingX={12}
                    paddingY={6}
                    borderRadius={6}
                    minWidth={80}
                    justifyContent="flex-end"
                >
                    <Input
                        value={input_str}
                        onValueChange={handle_text_change}
                        onFocusChange={(focused) => {
                            if (focused) {
                                setIsFocused(true);
                            } else {
                                handle_blur();
                            }
                        }}
                        width={48}
                        backgroundColor="transparent"
                        color="white"
                        fontSize={14}
                        textAlign="right"
                        disabled={disabled}
                    />
                    {unit && <Text fontSize={14} color="white" marginLeft={4}>{unit}</Text>}
                </Container>
            </Container>
        </Container>
    );
};

// TODO: accept focus, use on_direction to move slider when toggled into edit mode
