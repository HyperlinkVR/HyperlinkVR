import { useCallback, useMemo } from "react";

export const TextInput = ({
    value,
    on_change,
    label,
    tooltip,
    enabled = true,
    placeholder,
    max_length,
    subtype_hint,
    validation_regex,
    width
}: {
    value: string;
    on_change: (new_value: string) => void;
    label?: string;
    tooltip?: string;
    enabled?: boolean;
    placeholder?: string;
    max_length?: number;
    subtype_hint?: "email" | "password" | "url";
    validation_regex?: RegExp;
    width?: "short" | "medium" | "long";
}) => {
    const handle_change = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const new_value = e.target.value;
            if (validation_regex && !validation_regex.test(new_value)) {
                return; // Ignore invalid input
            }
            on_change(new_value);
        },
        [on_change, validation_regex]
    );

    const input_width = useMemo(() => {
        switch (width) {
            case "short":
                return {className: "w-24"};
            case "medium":
                return {className: "w-48"};
            case "long":
                return {className: "w-96"};
            default:
                // try to compute width based on max_length if provided, otherwise default to medium
                if (max_length) {
                    const computed_width = Math.min(Math.max(max_length * 0.6, 24), 96); // approximate width based on character count
                    return {style: {width: `${computed_width}px`}};
                }
                return {className: "w-48"};
        }
    }, [width, max_length]);

    return (
        <label title={tooltip} className="cursor-pointer flex items-center">
            {label && <span className="mr-2">{label}</span>}
            <input
                type={subtype_hint || "text"}
                className={`bg-gray-700 text-white rounded-md px-2 py-1 focus:outline-none ${enabled ? "" : "opacity-50 cursor-not-allowed"} ${input_width.className || ""}`}
                style={input_width.style}
                value={value}
                onChange={handle_change}
                disabled={!enabled}
                placeholder={placeholder}
                maxLength={max_length}
            />
        </label>
    );
};
