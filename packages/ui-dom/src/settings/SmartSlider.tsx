import { useEffect, useState } from "react";

interface SmartSliderProps {
    label?: string;
    value: number;
    on_change: (value: number) => void;
    slider_min?: number;
    slider_max?: number;
    min: number;
    max: number;
    step?: number; // how fine the input steps (e.g., 1, 0.1, 0.01, 0.001)
    precision_dp?: number; // hard rounding limit under the hood (e.g., 2 decimal places)
    unit?: string;
    enabled?: boolean;
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
    enabled = true
}: SmartSliderProps) => {
    const [input, setInput] = useState(value.toFixed(precision_dp));

    useEffect(() => {
        if (
            document.activeElement !== document.getElementById(`input-${label}`)
        ) {
            setInput(value.toFixed(precision_dp));
        }
    }, [value, precision_dp, label]);

    const handle_slider_change = (e: React.ChangeEvent<HTMLInputElement>) => {
        const num_val = parseFloat(e.target.value);
        on_change(num_val);
        setInput(num_val.toFixed(precision_dp));
    };

    const handle_text_change = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInput(val);

        const num_val = parseFloat(val);
        if (!isNaN(num_val)) {
            on_change(Math.max(min, Math.min(max, num_val)));
        }
    };

    const handle_blur = () => {
        let num_val = parseFloat(input);
        if (isNaN(num_val)) num_val = value;

        const final_val = Math.max(min, Math.min(max, num_val));
        on_change(final_val);
        setInput(final_val.toFixed(precision_dp));
    };

    return (
        <div
            className={`flex items-start justify-between w-full max-w-sm py-2 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
            <label className="text-xs select-none whitespace-nowrap mr-4">
                {label}
            </label>

            <div className="flex flex-wrap items-center justify-end gap-4 mt-2">
                <input
                    type="range"
                    min={slider_min}
                    max={slider_max}
                    step={step}
                    value={Math.max(slider_min, Math.min(slider_max, value))}
                    onChange={handle_slider_change}
                    className="w-full max-w-50 h-1 bg-slate-600 rounded-full appearance-none cursor-pointer accent-white focus:outline-none"
                    disabled={!enabled}
                />

                <div className="flex items-center bg-slate-700 px-3 py-1.5 rounded-md min-w-20 justify-end shadow-sm">
                    <input
                        id={`input-${label}`}
                        type="number"
                        value={input}
                        onChange={handle_text_change}
                        onBlur={handle_blur}
                        step={step}
                        className="w-12 bg-transparent text-right text-sm text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        disabled={!enabled}
                    />
                    <span className="text-sm text-white ml-1 select-none">
                        {unit}
                    </span>
                </div>
            </div>
        </div>
    );
};